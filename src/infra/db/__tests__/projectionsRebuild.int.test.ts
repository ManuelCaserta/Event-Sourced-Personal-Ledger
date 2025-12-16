import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../pool.js';
import { EventStoreRepo } from '../eventStoreRepo.js';
import { Projector } from '../projector.js';
import {
  AccountCreated,
  IncomeRecorded,
  ExpenseRecorded,
} from '../../../domain/ledger/events.js';
import { randomUUID } from 'crypto';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Projections Rebuild', () => {
  let userId: string;
  let accountId1: string;
  let accountId2: string;
  let testUserId: string;
  let eventStore: EventStoreRepo;
  let projector: Projector;
  const testEmail = `vitest-rebuild-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  beforeAll(async () => {
    await pool.query('SELECT 1');

    // Create test user
    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [testEmail, 'hash']
    );
    testUserId = userResult.rows[0].id;

    projector = new Projector();
    eventStore = new EventStoreRepo(projector);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM read_movements WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM read_accounts WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM events WHERE aggregate_id = $1 OR aggregate_id = $2', [
      accountId1,
      accountId2,
    ]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  beforeEach(() => {
    userId = testUserId;
    accountId1 = randomUUID();
    accountId2 = randomUUID();
  });

  afterEach(async () => {
    // Clean up
    await pool.query('DELETE FROM read_movements WHERE account_id IN ($1, $2)', [
      accountId1,
      accountId2,
    ]);
    await pool.query('DELETE FROM read_accounts WHERE account_id IN ($1, $2)', [
      accountId1,
      accountId2,
    ]);
    await pool.query('DELETE FROM events WHERE aggregate_id IN ($1, $2)', [
      accountId1,
      accountId2,
    ]);
  });

  it('should rebuild projections to match incremental updates', async () => {
    const correlationId = randomUUID();

    // Create accounts and events incrementally (simulating normal operation)
    const account1Created: AccountCreated = {
      type: 'AccountCreated',
      eventVersion: 1,
      name: 'Checking',
      currency: 'USD',
      allowNegative: false,
    };

    const account2Created: AccountCreated = {
      type: 'AccountCreated',
      eventVersion: 1,
      name: 'Savings',
      currency: 'USD',
      allowNegative: false,
    };

    await eventStore.append(
      'account',
      accountId1,
      [account1Created],
      -1,
      { userId, correlationId: randomUUID() }
    );

    await eventStore.append(
      'account',
      accountId2,
      [account2Created],
      -1,
      { userId, correlationId: randomUUID() }
    );

    // Add income to account1
    const income1: IncomeRecorded = {
      type: 'IncomeRecorded',
      eventVersion: 1,
      amountCents: 1000,
      occurredAt: new Date('2024-01-01'),
    };

    await eventStore.append('account', accountId1, [income1], 0, {
      userId,
      correlationId: randomUUID(),
    });

    // Add expense to account1
    const expense1: ExpenseRecorded = {
      type: 'ExpenseRecorded',
      eventVersion: 1,
      amountCents: 300,
      occurredAt: new Date('2024-01-02'),
    };

    await eventStore.append('account', accountId1, [expense1], 1, {
      userId,
      correlationId: randomUUID(),
    });

    // Add income to account2
    const income2: IncomeRecorded = {
      type: 'IncomeRecorded',
      eventVersion: 1,
      amountCents: 500,
      occurredAt: new Date('2024-01-03'),
    };

    await eventStore.append('account', accountId2, [income2], 0, {
      userId,
      correlationId: randomUUID(),
    });

    // Get state after incremental updates
    const incrementalAccounts = await pool.query(
      'SELECT * FROM read_accounts WHERE account_id IN ($1, $2) ORDER BY account_id',
      [accountId1, accountId2]
    );

    const incrementalMovements = await pool.query(
      'SELECT * FROM read_movements WHERE account_id IN ($1, $2) ORDER BY event_seq',
      [accountId1, accountId2]
    );

    // Now rebuild projections
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear projections
      await client.query('TRUNCATE TABLE read_movements CASCADE');
      await client.query('TRUNCATE TABLE read_accounts CASCADE');

      // Load all events and replay
      const eventsResult = await client.query(
        `SELECT event_seq, event_id, aggregate_type, aggregate_id, version,
                event_type, event_version, payload, metadata, occurred_at
         FROM events
         WHERE aggregate_id IN ($1, $2)
         ORDER BY event_seq ASC`,
        [accountId1, accountId2]
      );

      for (const row of eventsResult.rows) {
        const event = row.payload as AccountEvent;
        const metadata = row.metadata as { userId: string };

        let occurredAt: Date;
        if (
          event.type === 'IncomeRecorded' ||
          event.type === 'ExpenseRecorded' ||
          event.type === 'TransferSent' ||
          event.type === 'TransferReceived'
        ) {
          occurredAt = (event as { occurredAt: Date }).occurredAt || row.occurred_at;
        } else {
          occurredAt = row.occurred_at;
        }

        await projector.project(client, event, {
          eventSeq: row.event_seq,
          eventId: row.event_id,
          aggregateId: row.aggregate_id,
          userId: metadata.userId,
          occurredAt,
        });
      }

      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Get state after rebuild
    const rebuiltAccounts = await pool.query(
      'SELECT * FROM read_accounts WHERE account_id IN ($1, $2) ORDER BY account_id',
      [accountId1, accountId2]
    );

    const rebuiltMovements = await pool.query(
      'SELECT * FROM read_movements WHERE account_id IN ($1, $2) ORDER BY event_seq',
      [accountId1, accountId2]
    );

    // Compare results
    expect(rebuiltAccounts.rows).toHaveLength(incrementalAccounts.rows.length);

    // Check account1
    const incrementalAccount1 = incrementalAccounts.rows.find(
      (a) => a.account_id === accountId1
    );
    const rebuiltAccount1 = rebuiltAccounts.rows.find((a) => a.account_id === accountId1);

    expect(rebuiltAccount1.balance_cents).toBe(incrementalAccount1.balance_cents);
    expect(rebuiltAccount1.name).toBe(incrementalAccount1.name);

    // Check account2
    const incrementalAccount2 = incrementalAccounts.rows.find(
      (a) => a.account_id === accountId2
    );
    const rebuiltAccount2 = rebuiltAccounts.rows.find((a) => a.account_id === accountId2);

    expect(rebuiltAccount2.balance_cents).toBe(incrementalAccount2.balance_cents);

    // Check movements count
    expect(rebuiltMovements.rows.length).toBe(incrementalMovements.rows.length);

    // Check movement totals match
    const incrementalTotal = incrementalMovements.rows.reduce(
      (sum, m) => sum + Number(m.amount_cents),
      0
    );
    const rebuiltTotal = rebuiltMovements.rows.reduce(
      (sum, m) => sum + Number(m.amount_cents),
      0
    );

    expect(rebuiltTotal).toBe(incrementalTotal);
  });
});

