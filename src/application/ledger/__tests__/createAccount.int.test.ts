import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../../infra/db/pool.js';
import { EventStoreRepo } from '../../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../../infra/db/commandDedupRepo.js';
import { Projector } from '../../../infra/db/projector.js';
import { CreateAccountUseCase } from '../createAccount.js';
import { randomUUID } from 'crypto';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('CreateAccountUseCase', () => {
  let useCase: CreateAccountUseCase;
  let eventStore: EventStoreRepo;
  let commandDedup: CommandDedupRepo;
  let userId: string;
  let testUserId: string;
  const testEmail = `vitest-createAccount-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  beforeAll(async () => {
    await pool.query('SELECT 1');

    // Create test user
    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [testEmail, 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM events WHERE aggregate_id IN (SELECT account_id FROM read_accounts WHERE user_id = $1)', [testUserId]);
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  beforeEach(() => {
    userId = testUserId;
    const projector = new Projector();
    eventStore = new EventStoreRepo(projector);
    commandDedup = new CommandDedupRepo();
    useCase = new CreateAccountUseCase(eventStore, commandDedup);
  });

  afterEach(async () => {
    // Clean up test accounts
    const accountsResult = await pool.query(
      'SELECT account_id FROM read_accounts WHERE user_id = $1',
      [userId]
    );
    for (const row of accountsResult.rows) {
      await pool.query('DELETE FROM read_movements WHERE account_id = $1', [row.account_id]);
      await pool.query('DELETE FROM read_accounts WHERE account_id = $1', [row.account_id]);
      await pool.query('DELETE FROM events WHERE aggregate_id = $1', [row.account_id]);
    }
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [userId]);
  });

  it('should create a new account', async () => {
    const result = await useCase.execute({
      userId,
      name: 'Test Account',
      currency: 'USD',
      allowNegative: false,
      idempotencyKey: randomUUID(),
    });

    expect(result.accountId).toBeTruthy();
    expect(result.correlationId).toBeTruthy();

    // Verify account was created in read model
    const accountResult = await pool.query(
      'SELECT * FROM read_accounts WHERE account_id = $1',
      [result.accountId]
    );

    expect(accountResult.rows).toHaveLength(1);
    expect(accountResult.rows[0].name).toBe('Test Account');
    expect(accountResult.rows[0].currency).toBe('USD');
    expect(accountResult.rows[0].allow_negative).toBe(false);
    expect(Number(accountResult.rows[0].balance_cents)).toBe(0);

    // Verify event was stored
    const events = await eventStore.loadStream('account', result.accountId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('AccountCreated');
  });

  it('should be idempotent', async () => {
    const idempotencyKey = randomUUID();

    const result1 = await useCase.execute({
      userId,
      name: 'Idempotent Account',
      currency: 'EUR',
      allowNegative: true,
      idempotencyKey,
    });

    // Second call with same idempotency key should fail (duplicate)
    await expect(
      useCase.execute({
        userId,
        name: 'Different Name',
        currency: 'GBP',
        allowNegative: false,
        idempotencyKey, // Same key
      })
    ).rejects.toThrow('Command already executed');

    // Verify only one account was created
    const accountsResult = await pool.query(
      'SELECT * FROM read_accounts WHERE user_id = $1',
      [userId]
    );
    expect(accountsResult.rows).toHaveLength(1);
    expect(accountsResult.rows[0].account_id).toBe(result1.accountId);
  });

  it('should create multiple accounts with different keys', async () => {
    const result1 = await useCase.execute({
      userId,
      name: 'Account 1',
      currency: 'USD',
      allowNegative: false,
      idempotencyKey: randomUUID(),
    });

    const result2 = await useCase.execute({
      userId,
      name: 'Account 2',
      currency: 'EUR',
      allowNegative: true,
      idempotencyKey: randomUUID(),
    });

    expect(result1.accountId).not.toBe(result2.accountId);

    const accountsResult = await pool.query(
      'SELECT * FROM read_accounts WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    expect(accountsResult.rows).toHaveLength(2);
  });
});

