import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../../infra/db/pool.js';
import { EventStoreRepo } from '../../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../../infra/db/commandDedupRepo.js';
import { Projector } from '../../../infra/db/projector.js';
import { CreateAccountUseCase } from '../createAccount.js';
import { RecordIncomeUseCase } from '../recordIncome.js';
import { randomUUID } from 'crypto';

describe('RecordIncomeUseCase', () => {
  let createAccountUseCase: CreateAccountUseCase;
  let useCase: RecordIncomeUseCase;
  let eventStore: EventStoreRepo;
  let commandDedup: CommandDedupRepo;
  let userId: string;
  let accountId: string;
  let testUserId: string;

  beforeAll(async () => {
    await pool.query('SELECT 1');

    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['record-income-test@example.com', 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM read_movements WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM events WHERE aggregate_id IN (SELECT account_id FROM read_accounts WHERE user_id = $1)', [testUserId]);
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    userId = testUserId;
    const projector = new Projector();
    eventStore = new EventStoreRepo(projector);
    commandDedup = new CommandDedupRepo();
    createAccountUseCase = new CreateAccountUseCase(eventStore, commandDedup);
    useCase = new RecordIncomeUseCase(eventStore, commandDedup);

    // Create account for each test
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

  it('should record income and update balance', async () => {
    const result = await useCase.execute({
      userId,
      accountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      description: 'Salary',
      idempotencyKey: randomUUID(),
    });

    expect(result.newBalance).toBe(1000);
    expect(result.correlationId).toBeTruthy();

    // Verify balance in read model
    const accountResult = await pool.query(
      'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
      [accountId]
    );
    expect(accountResult.rows[0].balance_cents).toBe(1000);

    // Verify movement was created
    const movementResult = await pool.query(
      'SELECT * FROM read_movements WHERE account_id = $1',
      [accountId]
    );
    expect(movementResult.rows).toHaveLength(1);
    expect(movementResult.rows[0].kind).toBe('income');
    expect(movementResult.rows[0].amount_cents).toBe(1000);
  });

  it('should accumulate multiple incomes', async () => {
    await useCase.execute({
      userId,
      accountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    const result = await useCase.execute({
      userId,
      accountId,
      amountCents: 500,
      occurredAt: new Date('2024-01-02'),
      idempotencyKey: randomUUID(),
    });

    expect(result.newBalance).toBe(1500);

    const accountResult = await pool.query(
      'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
      [accountId]
    );
    expect(accountResult.rows[0].balance_cents).toBe(1500);
  });

  it('should be idempotent', async () => {
    const idempotencyKey = randomUUID();

    const result1 = await useCase.execute({
      userId,
      accountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey,
    });

    const result2 = await useCase.execute({
      userId,
      accountId,
      amountCents: 2000, // Different amount
      occurredAt: new Date('2024-01-02'), // Different date
      idempotencyKey, // Same key
    });

    // Should return same result as first call
    expect(result2.correlationId).toBe(result1.correlationId);
    expect(result2.newBalance).toBe(result1.newBalance);

    // Verify only one income was recorded
    const movementResult = await pool.query(
      'SELECT * FROM read_movements WHERE account_id = $1',
      [accountId]
    );
    expect(movementResult.rows).toHaveLength(1);
    expect(movementResult.rows[0].amount_cents).toBe(1000);
  });

  it('should throw error for non-existent account', async () => {
    await expect(
      useCase.execute({
        userId,
        accountId: randomUUID(),
        amountCents: 1000,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow('Account not found');
  });
});

