import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../pool.js';
import { EventStoreRepo, ConcurrencyError } from '../eventStoreRepo.js';
import {
  AccountCreated,
  IncomeRecorded,
} from '../../../domain/ledger/events.js';
import { randomUUID } from 'crypto';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('EventStoreRepo', () => {
  const repo = new EventStoreRepo();
  let aggregateId: string;
  let aggregateId2: string | null;
  let userId: string;

  beforeAll(async () => {
    // Ensure database is ready
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
  });

  beforeEach(() => {
    aggregateId = randomUUID();
    aggregateId2 = null;
    userId = randomUUID();
  });

  afterEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM events WHERE aggregate_id = $1', [
      aggregateId,
    ]);
    if (aggregateId2) {
      await pool.query('DELETE FROM events WHERE aggregate_id = $1', [aggregateId2]);
    }
  });

  describe('loadStream', () => {
    it('should return empty array for non-existent stream', async () => {
      const events = await repo.loadStream('account', aggregateId);
      expect(events).toEqual([]);
    });

    it('should load events in version order', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event1: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test Account',
        currency: 'USD',
        allowNegative: false,
      };

      const event2: IncomeRecorded = {
        type: 'IncomeRecorded',
        eventVersion: 1,
        amountCents: 1000,
        occurredAt: new Date('2024-01-01'),
      };

      await repo.append('account', aggregateId, [event1], -1, metadata);
      await repo.append('account', aggregateId, [event2], 0, metadata);

      const events = await repo.loadStream('account', aggregateId);

      expect(events).toHaveLength(2);
      expect(events[0].version).toBe(0);
      expect(events[0].eventType).toBe('AccountCreated');
      expect(events[1].version).toBe(1);
      expect(events[1].eventType).toBe('IncomeRecorded');
    });
  });

  describe('getStreamVersion', () => {
    it('should return -1 for non-existent stream', async () => {
      const version = await repo.getStreamVersion('account', aggregateId);
      expect(version).toBe(-1);
    });

    it('should return current version after appending events', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test',
        currency: 'USD',
        allowNegative: false,
      };

      await repo.append('account', aggregateId, [event], -1, metadata);

      const version = await repo.getStreamVersion('account', aggregateId);
      expect(version).toBe(0);
    });
  });

  describe('append', () => {
    it('should append single event to new stream', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test Account',
        currency: 'USD',
        allowNegative: false,
      };

      const stored = await repo.append('account', aggregateId, [event], -1, metadata);

      expect(stored).toHaveLength(1);
      expect(stored[0].eventType).toBe('AccountCreated');
      expect(stored[0].version).toBe(0);
      expect(stored[0].aggregateId).toBe(aggregateId);
      expect(stored[0].metadata.userId).toBe(userId);
    });

    it('should append multiple events atomically', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event1: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test',
        currency: 'USD',
        allowNegative: false,
      };

      const event2: IncomeRecorded = {
        type: 'IncomeRecorded',
        eventVersion: 1,
        amountCents: 1000,
        occurredAt: new Date('2024-01-01'),
      };

      const stored = await repo.append('account', aggregateId, [event1, event2], -1, metadata);

      expect(stored).toHaveLength(2);
      expect(stored[0].version).toBe(0);
      expect(stored[1].version).toBe(1);

      // Verify both events are persisted
      const loaded = await repo.loadStream('account', aggregateId);
      expect(loaded).toHaveLength(2);
    });

    it('should throw ConcurrencyError on version mismatch', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event1: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test',
        currency: 'USD',
        allowNegative: false,
      };

      const event2: IncomeRecorded = {
        type: 'IncomeRecorded',
        eventVersion: 1,
        amountCents: 1000,
        occurredAt: new Date('2024-01-01'),
      };

      // Append first event
      await repo.append('account', aggregateId, [event1], -1, metadata);

      // Try to append with wrong expected version
      await expect(
        repo.append('account', aggregateId, [event2], -1, metadata)
      ).rejects.toThrow(ConcurrencyError);

      // Verify only first event was persisted
      const loaded = await repo.loadStream('account', aggregateId);
      expect(loaded).toHaveLength(1);
    });

    it('should succeed with correct expected version', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event1: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test',
        currency: 'USD',
        allowNegative: false,
      };

      const event2: IncomeRecorded = {
        type: 'IncomeRecorded',
        eventVersion: 1,
        amountCents: 1000,
        occurredAt: new Date('2024-01-01'),
      };

      await repo.append('account', aggregateId, [event1], -1, metadata);
      await repo.append('account', aggregateId, [event2], 0, metadata);

      const loaded = await repo.loadStream('account', aggregateId);
      expect(loaded).toHaveLength(2);
    });

    it('should handle concurrent append attempts', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'Test',
        currency: 'USD',
        allowNegative: false,
      };

      // First append succeeds
      await repo.append('account', aggregateId, [event], -1, metadata);

      // Concurrent attempts with same expected version should fail
      const promises = [
        repo.append('account', aggregateId, [event], 0, metadata),
        repo.append('account', aggregateId, [event], 0, metadata),
      ];

      const results = await Promise.allSettled(promises);

      // One should succeed, one should fail
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof ConcurrencyError
      );

      expect(successes.length + failures.length).toBe(2);
      expect(failures.length).toBeGreaterThan(0);
    });

    it('should preserve event payload and metadata', async () => {
      const metadata = {
        userId,
        correlationId: randomUUID(),
        causationId: randomUUID(),
        requestId: 'req-123',
      };

      const event: IncomeRecorded = {
        type: 'IncomeRecorded',
        eventVersion: 1,
        amountCents: 5000,
        occurredAt: new Date('2024-01-15T10:30:00Z'),
        description: 'Salary payment',
      };

      const stored = await repo.append('account', aggregateId, [event], -1, metadata);

      expect(stored[0].payload).toMatchObject(event);
      expect(stored[0].metadata).toMatchObject(metadata);
      expect(stored[0].occurredAt).toEqual(event.occurredAt);
    });
  });

  describe('appendMultiple', () => {
    it('should rollback all appends if any append fails (atomic cross-stream)', async () => {
      aggregateId2 = randomUUID();

      const metadata = {
        userId,
        correlationId: randomUUID(),
      };

      const event1: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'A1',
        currency: 'USD',
        allowNegative: false,
      };

      const event2: AccountCreated = {
        type: 'AccountCreated',
        eventVersion: 1,
        name: 'A2',
        currency: 'USD',
        allowNegative: false,
      };

      // Second append intentionally fails: new stream has actualVersion = -1, expectedVersion = 0
      await expect(
        repo.appendMultiple([
          {
            aggregateType: 'account',
            aggregateId,
            events: [event1],
            expectedVersion: -1,
            metadata,
          },
          {
            aggregateType: 'account',
            aggregateId: aggregateId2,
            events: [event2],
            expectedVersion: 0,
            metadata,
          },
        ])
      ).rejects.toThrow(ConcurrencyError);

      // If atomic, the first stream must also have no events.
      const loaded1 = await repo.loadStream('account', aggregateId);
      const loaded2 = await repo.loadStream('account', aggregateId2);
      expect(loaded1).toHaveLength(0);
      expect(loaded2).toHaveLength(0);
    });
  });
});

