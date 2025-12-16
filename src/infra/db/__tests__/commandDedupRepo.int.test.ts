import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../pool.js';
import { CommandDedupRepo } from '../commandDedupRepo.js';
import { randomUUID } from 'crypto';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('CommandDedupRepo', () => {
  const repo = new CommandDedupRepo();
  let userId: string;
  let testUserId: string;
  const testEmail = `vitest-commandDedup-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  beforeAll(async () => {
    // Ensure database is ready
    await pool.query('SELECT 1');

    // Create a test user for foreign key constraints
    const userResult = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [testEmail, 'hash']
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test user
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  beforeEach(() => {
    userId = testUserId;
  });

  afterEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [userId]);
  });

  describe('beginCommand', () => {
    it('should return new correlationId for first command', async () => {
      const idempotencyKey = randomUUID();
      const result = await repo.beginCommand(userId, idempotencyKey);

      expect(result.isDuplicate).toBe(false);
      expect(result.correlationId).toBeTruthy();
      expect(typeof result.correlationId).toBe('string');
    });

    it('should return same correlationId for duplicate command', async () => {
      const idempotencyKey = randomUUID();
      const first = await repo.beginCommand(userId, idempotencyKey);
      const second = await repo.beginCommand(userId, idempotencyKey);

      expect(first.isDuplicate).toBe(false);
      expect(second.isDuplicate).toBe(true);
      expect(second.correlationId).toBe(first.correlationId);
    });

    it('should allow different idempotency keys for same user', async () => {
      const key1 = randomUUID();
      const key2 = randomUUID();

      const result1 = await repo.beginCommand(userId, key1);
      const result2 = await repo.beginCommand(userId, key2);

      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
      expect(result1.correlationId).not.toBe(result2.correlationId);
    });

    it('should allow same idempotency key for different users', async () => {
      // Create another test user
      const testEmail2 = `vitest-commandDedup2-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
      const userResult = await pool.query<{ id: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [testEmail2, 'hash']
      );
      const userId2 = userResult.rows[0].id;

      try {
        const idempotencyKey = randomUUID();
        const result1 = await repo.beginCommand(userId, idempotencyKey);
        const result2 = await repo.beginCommand(userId2, idempotencyKey);

        expect(result1.isDuplicate).toBe(false);
        expect(result2.isDuplicate).toBe(false);
        expect(result1.correlationId).not.toBe(result2.correlationId);
      } finally {
        // Clean up
        await pool.query('DELETE FROM command_dedup WHERE user_id = $1', [
          userId2,
        ]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId2]);
      }
    });

    it('should handle concurrent duplicate requests', async () => {
      const idempotencyKey = randomUUID();

      // First request
      const first = await repo.beginCommand(userId, idempotencyKey);

      // Concurrent duplicate requests
      const promises = [
        repo.beginCommand(userId, idempotencyKey),
        repo.beginCommand(userId, idempotencyKey),
        repo.beginCommand(userId, idempotencyKey),
      ];

      const results = await Promise.all(promises);

      // All should return the same correlationId
      results.forEach((result) => {
        expect(result.isDuplicate).toBe(true);
        expect(result.correlationId).toBe(first.correlationId);
      });
    });
  });

  describe('getCorrelationId', () => {
    it('should return null for non-existent key', async () => {
      const correlationId = await repo.getCorrelationId(
        userId,
        randomUUID()
      );
      expect(correlationId).toBeNull();
    });

    it('should return correlationId for existing key', async () => {
      const idempotencyKey = randomUUID();
      const beginResult = await repo.beginCommand(userId, idempotencyKey);

      const correlationId = await repo.getCorrelationId(userId, idempotencyKey);

      expect(correlationId).toBe(beginResult.correlationId);
    });
  });
});

