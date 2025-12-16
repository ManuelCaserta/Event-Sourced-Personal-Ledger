import { pool } from './pool.js';
import { randomUUID } from 'crypto';

export interface CommandDedupResult {
  isDuplicate: boolean;
  correlationId: string;
}

export class CommandDedupRepo {
  /**
   * Begin a command execution with idempotency check.
   * Returns correlationId if new, or existing correlationId if duplicate.
   */
  async beginCommand(
    userId: string,
    idempotencyKey: string
  ): Promise<CommandDedupResult> {
    const correlationId = randomUUID();

    try {
      const result = await pool.query<{
        id: string;
        correlation_id: string;
      }>(
        `INSERT INTO command_dedup (user_id, idempotency_key, correlation_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, idempotency_key)
         DO UPDATE SET correlation_id = command_dedup.correlation_id
         RETURNING id, correlation_id`,
        [userId, idempotencyKey, correlationId]
      );

      const row = result.rows[0];

      // Check if this was a new insert or an existing row
      // If the returned correlation_id matches our new one, it's new
      // Otherwise, it's a duplicate
      const isDuplicate = row.correlation_id !== correlationId;

      return {
        isDuplicate,
        correlationId: row.correlation_id,
      };
    } catch (error) {
      // Handle potential constraint violations
      if (error instanceof Error) {
        throw new Error(`Failed to begin command: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get existing correlation ID for an idempotency key (if exists).
   */
  async getCorrelationId(
    userId: string,
    idempotencyKey: string
  ): Promise<string | null> {
    const result = await pool.query<{ correlation_id: string }>(
      `SELECT correlation_id
       FROM command_dedup
       WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey]
    );

    return result.rows[0]?.correlation_id ?? null;
  }
}

