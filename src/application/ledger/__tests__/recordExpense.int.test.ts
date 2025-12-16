import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../../infra/db/pool.js';
import { EventStoreRepo } from '../../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../../infra/db/commandDedupRepo.js';
import { Projector } from '../../../infra/db/projector.js';
import { CreateAccountUseCase } from '../createAccount.js';
import { RecordIncomeUseCase } from '../recordIncome.js';
import { RecordExpenseUseCase } from '../recordExpense.js';
import { InsufficientBalanceError } from '../../../domain/ledger/errors.js';
import { randomUUID } from 'crypto';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('RecordExpenseUseCase', () => {
  let createAccountUseCase: CreateAccountUseCase;
  let recordIncomeUseCase: RecordIncomeUseCase;
  let useCase: RecordExpenseUseCase;
  let eventStore: EventStoreRepo;
  let commandDedup: CommandDedupRepo;
  let userId: string;
  let accountId: string;
  let testUserId: string;
  const testEmail = `vitest-recordExpense-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  beforeAll(async () => {
    await pool.query('SELECT 1');

    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [testEmail, 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM read_movements WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM events WHERE aggregate_id IN (SELECT account_id FROM read_accounts WHERE user_id = $1)', [testUserId]);
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  beforeEach(async () => {
    userId = testUserId;
    const projector = new Projector();
    eventStore = new EventStoreRepo(projector);
    commandDedup = new CommandDedupRepo();
    createAccountUseCase = new CreateAccountUseCase(eventStore, commandDedup);
    recordIncomeUseCase = new RecordIncomeUseCase(eventStore, commandDedup);
    useCase = new RecordExpenseUseCase(eventStore, commandDedup);

    const createResult = await createAccountUseCase.execute({
      userId,
      name: 'Test Account',
      currency: 'USD',
      allowNegative: false,
      idempotencyKey: randomUUID(),
    });
    accountId = createResult.accountId;
  });

  afterEach(async () => {
    await pool.query('DELETE FROM read_movements WHERE account_id = $1', [accountId]);
    await pool.query('DELETE FROM read_accounts WHERE account_id = $1', [accountId]);
    await pool.query('DELETE FROM events WHERE aggregate_id = $1', [accountId]);
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [userId]);
  });

  it('should record expense and decrease balance', async () => {
    // Add income first
    await recordIncomeUseCase.execute({
      userId,
      accountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    const result = await useCase.execute({
      userId,
      accountId,
      amountCents: 300,
      occurredAt: new Date('2024-01-02'),
      description: 'Groceries',
      idempotencyKey: randomUUID(),
    });

    expect(result.newBalance).toBe(700);

    const accountResult = await pool.query(
      'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
      [accountId]
    );
    expect(Number(accountResult.rows[0].balance_cents)).toBe(700);
  });

  it('should throw InsufficientBalanceError when allowNegative=false', async () => {
    // Add income
    await recordIncomeUseCase.execute({
      userId,
      accountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    // Try to spend more than balance
    await expect(
      useCase.execute({
        userId,
        accountId,
        amountCents: 1500,
        occurredAt: new Date('2024-01-02'),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it('should allow negative balance when allowNegative=true', async () => {
    // Create account with allowNegative=true
    const createResult = await createAccountUseCase.execute({
      userId,
      name: 'Credit Account',
      currency: 'USD',
      allowNegative: true,
      idempotencyKey: randomUUID(),
    });

    const creditAccountId = createResult.accountId;

    // Add some income
    await recordIncomeUseCase.execute({
      userId,
      accountId: creditAccountId,
      amountCents: 500,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    // Spend more than balance
    const result = await useCase.execute({
      userId,
      accountId: creditAccountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-02'),
      idempotencyKey: randomUUID(),
    });

    expect(result.newBalance).toBe(-500);

    // Clean up
    await pool.query('DELETE FROM read_movements WHERE account_id = $1', [creditAccountId]);
    await pool.query('DELETE FROM read_accounts WHERE account_id = $1', [creditAccountId]);
    await pool.query('DELETE FROM events WHERE aggregate_id = $1', [creditAccountId]);
  });

  it('should be idempotent', async () => {
    await recordIncomeUseCase.execute({
      userId,
      accountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    const idempotencyKey = randomUUID();

    const result1 = await useCase.execute({
      userId,
      accountId,
      amountCents: 300,
      occurredAt: new Date('2024-01-02'),
      idempotencyKey,
    });

    const result2 = await useCase.execute({
      userId,
      accountId,
      amountCents: 500, // Different amount
      occurredAt: new Date('2024-01-03'), // Different date
      idempotencyKey, // Same key
    });

    expect(result2.correlationId).toBe(result1.correlationId);
    expect(result2.newBalance).toBe(result1.newBalance);

    // Verify only one expense was recorded
    const movementResult = await pool.query(
      "SELECT * FROM read_movements WHERE account_id = $1 AND kind = 'expense'",
      [accountId]
    );
    expect(movementResult.rows).toHaveLength(1);
    expect(Number(movementResult.rows[0].amount_cents)).toBe(300);
  });
});

