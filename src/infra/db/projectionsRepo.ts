import { pool } from './pool.js';

export interface AccountProjection {
  accountId: string;
  userId: string;
  name: string;
  currency: string;
  allowNegative: boolean;
  balanceCents: number;
  lastVersion: number;
  updatedAt: Date;
}

export interface MovementProjection {
  movementId: string;
  accountId: string;
  userId: string;
  kind: 'income' | 'expense' | 'transfer_in' | 'transfer_out';
  amountCents: number;
  description: string | null;
  occurredAt: Date;
  transferId: string | null;
  eventId: string;
  eventSeq: number;
}

export class ProjectionsRepo {
  async getAccountsByUserId(userId: string): Promise<AccountProjection[]> {
    const result = await pool.query<{
      account_id: string;
      user_id: string;
      name: string;
      currency: string;
      allow_negative: boolean;
      balance_cents: number;
      last_version: number;
      updated_at: Date;
    }>(
      `SELECT account_id, user_id, name, currency, allow_negative,
              balance_cents, last_version, updated_at
       FROM read_accounts
       WHERE user_id = $1
       ORDER BY name`,
      [userId]
    );

    return result.rows.map((row) => ({
      accountId: row.account_id,
      userId: row.user_id,
      name: row.name,
      currency: row.currency,
      allowNegative: row.allow_negative,
      balanceCents: Number(row.balance_cents),
      lastVersion: row.last_version,
      updatedAt: row.updated_at,
    }));
  }

  async getAccountById(accountId: string, userId: string): Promise<AccountProjection | null> {
    const result = await pool.query<{
      account_id: string;
      user_id: string;
      name: string;
      currency: string;
      allow_negative: boolean;
      balance_cents: number;
      last_version: number;
      updated_at: Date;
    }>(
      `SELECT account_id, user_id, name, currency, allow_negative,
              balance_cents, last_version, updated_at
       FROM read_accounts
       WHERE account_id = $1 AND user_id = $2`,
      [accountId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      accountId: row.account_id,
      userId: row.user_id,
      name: row.name,
      currency: row.currency,
      allowNegative: row.allow_negative,
      balanceCents: Number(row.balance_cents),
      lastVersion: row.last_version,
      updatedAt: row.updated_at,
    };
  }

  async getMovements(
    accountId: string,
    userId: string,
    limit: number = 50,
    cursor?: number
  ): Promise<{ movements: MovementProjection[]; nextCursor?: number }> {
    let query = `SELECT movement_id, account_id, user_id, kind, amount_cents,
                        description, occurred_at, transfer_id, event_id, event_seq
                 FROM read_movements
                 WHERE account_id = $1 AND user_id = $2`;

    const params: unknown[] = [accountId, userId];

    if (cursor) {
      query += ' AND event_seq < $3';
      params.push(cursor);
    }

    query += ' ORDER BY event_seq DESC LIMIT $' + (params.length + 1);
    params.push(limit + 1); // Fetch one extra to check if there's more

    const result = await pool.query<{
      movement_id: string;
      account_id: string;
      user_id: string;
      kind: string;
      amount_cents: number;
      description: string | null;
      occurred_at: Date;
      transfer_id: string | null;
      event_id: string;
      event_seq: number;
    }>(query, params);

    const movements = result.rows.slice(0, limit).map((row) => ({
      movementId: row.movement_id,
      accountId: row.account_id,
      userId: row.user_id,
      kind: row.kind as MovementProjection['kind'],
      amountCents: Number(row.amount_cents),
      description: row.description,
      occurredAt: row.occurred_at,
      transferId: row.transfer_id,
      eventId: row.event_id,
      eventSeq: row.event_seq,
    }));

    const nextCursor =
      result.rows.length > limit ? result.rows[limit - 1].event_seq : undefined;

    return { movements, nextCursor };
  }
}

