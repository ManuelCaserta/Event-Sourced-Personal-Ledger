import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../../infra/db/pool.js';
import { EventStoreRepo } from '../../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../../infra/db/commandDedupRepo.js';
import { Projector } from '../../../infra/db/projector.js';
import { CreateAccountUseCase } from '../createAccount.js';
import { RecordIncomeUseCase } from '../recordIncome.js';
import { TransferUseCase } from '../transfer.js';
import { CurrencyMismatchError, InsufficientBalanceError } from '../../../domain/ledger/errors.js';
import { ConcurrencyError } from '../../../infra/db/eventStoreRepo.js';
import { randomUUID } from 'crypto';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('TransferUseCase', () => {
  let createAccountUseCase: CreateAccountUseCase;
  let recordIncomeUseCase: RecordIncomeUseCase;
  let useCase: TransferUseCase;
  let eventStore: EventStoreRepo;
  let commandDedup: CommandDedupRepo;
  let userId: string;
  let fromAccountId: string;
  let toAccountId: string;
  let testUserId: string;

  beforeAll(async () => {
    await pool.query('SELECT 1');

    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['transfer-test@example.com', 'hash']
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
    recordIncomeUseCase = new RecordIncomeUseCase(eventStore, commandDedup);
    useCase = new TransferUseCase(eventStore, commandDedup);

    // Create two accounts
    const fromResult = await createAccountUseCase.execute({
      userId,
      name: 'From Account',
      currency: 'USD',
      allowNegative: false,
      idempotencyKey: randomUUID(),
    });
    fromAccountId = fromResult.accountId;

    const toResult = await createAccountUseCase.execute({
      userId,
      name: 'To Account',
      currency: 'USD',
      allowNegative: false,
      idempotencyKey: randomUUID(),
    });
    toAccountId = toResult.accountId;
  });

  afterEach(async () => {
    await pool.query('DELETE FROM read_movements WHERE account_id IN ($1, $2)', [
      fromAccountId,
      toAccountId,
    ]);
    await pool.query('DELETE FROM read_accounts WHERE account_id IN ($1, $2)', [
      fromAccountId,
      toAccountId,
    ]);
    await pool.query('DELETE FROM events WHERE aggregate_id IN ($1, $2)', [
      fromAccountId,
      toAccountId,
    ]);
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [userId]);
  });

  it('should transfer money between accounts', async () => {
    // Add income to source account
    await recordIncomeUseCase.execute({
      userId,
      accountId: fromAccountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    const result = await useCase.execute({
      userId,
      fromAccountId,
      toAccountId,
      amountCents: 300,
      occurredAt: new Date('2024-01-02'),
      description: 'Transfer to savings',
      idempotencyKey: randomUUID(),
    });

    expect(result.fromAccountBalance).toBe(700);
    expect(result.toAccountBalance).toBe(300);

    // Verify balances in read model
    const fromAccountResult = await pool.query(
      'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
      [fromAccountId]
    );
    expect(fromAccountResult.rows[0].balance_cents).toBe(700);

    const toAccountResult = await pool.query(
      'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
      [toAccountId]
    );
    expect(toAccountResult.rows[0].balance_cents).toBe(300);

    // Verify movements were created
    const fromMovements = await pool.query(
      "SELECT * FROM read_movements WHERE account_id = $1 AND kind = 'transfer_out'",
      [fromAccountId]
    );
    expect(fromMovements.rows).toHaveLength(1);
    expect(fromMovements.rows[0].amount_cents).toBe(300);

    const toMovements = await pool.query(
      "SELECT * FROM read_movements WHERE account_id = $1 AND kind = 'transfer_in'",
      [toAccountId]
    );
    expect(toMovements.rows).toHaveLength(1);
    expect(toMovements.rows[0].amount_cents).toBe(300);
    expect(toMovements.rows[0].transfer_id).toBe(fromMovements.rows[0].transfer_id);
  });

  it('should throw InsufficientBalanceError when source has insufficient funds', async () => {
    await recordIncomeUseCase.execute({
      userId,
      accountId: fromAccountId,
      amountCents: 500,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    await expect(
      useCase.execute({
        userId,
        fromAccountId,
        toAccountId,
        amountCents: 1000, // More than balance
        occurredAt: new Date('2024-01-02'),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it('should throw CurrencyMismatchError for different currencies', async () => {
    // Create EUR account
    const eurResult = await createAccountUseCase.execute({
      userId,
      name: 'EUR Account',
      currency: 'EUR',
      allowNegative: false,
      idempotencyKey: randomUUID(),
    });

    await expect(
      useCase.execute({
        userId,
        fromAccountId, // USD
        toAccountId: eurResult.accountId, // EUR
        amountCents: 100,
        occurredAt: new Date('2024-01-01'),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(CurrencyMismatchError);

    // Clean up
    await pool.query('DELETE FROM read_movements WHERE account_id = $1', [eurResult.accountId]);
    await pool.query('DELETE FROM read_accounts WHERE account_id = $1', [eurResult.accountId]);
    await pool.query('DELETE FROM events WHERE aggregate_id = $1', [eurResult.accountId]);
  });

  it('should be idempotent', async () => {
    await recordIncomeUseCase.execute({
      userId,
      accountId: fromAccountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    const idempotencyKey = randomUUID();

    const result1 = await useCase.execute({
      userId,
      fromAccountId,
      toAccountId,
      amountCents: 300,
      occurredAt: new Date('2024-01-02'),
      idempotencyKey,
    });

    const result2 = await useCase.execute({
      userId,
      fromAccountId,
      toAccountId,
      amountCents: 500, // Different amount
      occurredAt: new Date('2024-01-03'), // Different date
      idempotencyKey, // Same key
    });

    expect(result2.correlationId).toBe(result1.correlationId);
    expect(result2.fromAccountBalance).toBe(result1.fromAccountBalance);
    expect(result2.toAccountBalance).toBe(result1.toAccountBalance);

    // Verify only one transfer was recorded
    const fromMovements = await pool.query(
      "SELECT * FROM read_movements WHERE account_id = $1 AND kind = 'transfer_out'",
      [fromAccountId]
    );
    expect(fromMovements.rows).toHaveLength(1);
    expect(fromMovements.rows[0].amount_cents).toBe(300);
  });

  it('should throw error for non-existent source account', async () => {
    await expect(
      useCase.execute({
        userId,
        fromAccountId: randomUUID(),
        toAccountId,
        amountCents: 100,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow('Source account not found');
  });

  it('should throw error for non-existent destination account', async () => {
    await expect(
      useCase.execute({
        userId,
        fromAccountId,
        toAccountId: randomUUID(),
        amountCents: 100,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow('Destination account not found');
  });

  it('should rollback both appends if second append fails (atomicity test)', async () => {
    // Add income to source account
    await recordIncomeUseCase.execute({
      userId,
      accountId: fromAccountId,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
      idempotencyKey: randomUUID(),
    });

    // Load current versions
    const fromEventsBefore = await eventStore.loadStream('account', fromAccountId);
    const toEventsBefore = await eventStore.loadStream('account', toAccountId);
    const fromVersionBefore = fromEventsBefore[fromEventsBefore.length - 1].version;
    const toVersionBefore = toEventsBefore[toEventsBefore.length - 1].version;

    // Manually modify the destination account stream to change its version
    // This simulates a concurrent modification that will cause the second append to fail
    const { IncomeRecorded } = await import('../../../domain/ledger/events.js');
    const concurrentEvent: IncomeRecorded = {
      type: 'IncomeRecorded',
      eventVersion: 1,
      amountCents: 100,
      occurredAt: new Date('2024-01-01T12:00:00Z'),
      description: 'Concurrent income',
    };

    // Append a concurrent event to the destination account (this changes its version)
    await eventStore.append(
      'account',
      toAccountId,
      [concurrentEvent],
      toVersionBefore,
      {
        userId,
        correlationId: randomUUID(),
      }
    );

    // Now attempt transfer - the second append should fail because toVersionBefore is stale
    // The entire transaction should rollback, so the first append (sentEvent) should NOT be persisted
    await expect(
      useCase.execute({
        userId,
        fromAccountId,
        toAccountId,
        amountCents: 300,
        occurredAt: new Date('2024-01-02'),
        description: 'Transfer that should fail',
        idempotencyKey: randomUUID(),
      })
    ).rejects.toThrow(ConcurrencyError); // Should throw ConcurrencyError

    // Verify that the source account does NOT have the TransferSent event persisted
    // (proving the rollback worked)
    const fromEventsAfter = await eventStore.loadStream('account', fromAccountId);
    const transferSentEvents = fromEventsAfter.filter(
      (e) => (e.payload as { type?: string }).type === 'TransferSent'
    );
    expect(transferSentEvents).toHaveLength(0);

    // Verify the source account version is unchanged (no new events were persisted)
    const fromVersionAfter = fromEventsAfter[fromEventsAfter.length - 1].version;
    expect(fromVersionAfter).toBe(fromVersionBefore);

    // Verify the source account balance is unchanged
    const fromAccountResult = await pool.query(
      'SELECT balance_cents FROM read_accounts WHERE account_id = $1',
      [fromAccountId]
    );
    expect(fromAccountResult.rows[0].balance_cents).toBe(1000); // Still 1000, no transfer happened
  });
});

