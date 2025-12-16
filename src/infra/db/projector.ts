import type { PoolClient } from 'pg';
import {
  AccountEvent,
  AccountCreated,
  IncomeRecorded,
  ExpenseRecorded,
  TransferSent,
  TransferReceived,
  AccountArchived,
} from '../../domain/ledger/events.js';

export interface ProjectionContext {
  eventSeq: number;
  eventId: string;
  aggregateId: string;
  userId: string;
  occurredAt: Date;
}

export class Projector {
  /**
   * Project a single event to the read models.
   * This is called within the same transaction as event append.
   */
  async project(
    client: PoolClient,
    event: AccountEvent,
    context: ProjectionContext
  ): Promise<void> {
    switch (event.type) {
      case 'AccountCreated':
        await this.projectAccountCreated(client, event, context);
        break;
      case 'IncomeRecorded':
        await this.projectIncomeRecorded(client, event, context);
        break;
      case 'ExpenseRecorded':
        await this.projectExpenseRecorded(client, event, context);
        break;
      case 'TransferSent':
        await this.projectTransferSent(client, event, context);
        break;
      case 'TransferReceived':
        await this.projectTransferReceived(client, event, context);
        break;
      case 'AccountArchived':
        await this.projectAccountArchived(client, event, context);
        break;
    }
  }

  private async projectAccountCreated(
    client: PoolClient,
    event: AccountCreated,
    context: ProjectionContext
  ): Promise<void> {
    await client.query(
      `INSERT INTO read_accounts (
        account_id, user_id, name, currency, allow_negative,
        balance_cents, last_version, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (account_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        currency = EXCLUDED.currency,
        allow_negative = EXCLUDED.allow_negative,
        last_version = GREATEST(read_accounts.last_version, EXCLUDED.last_version),
        updated_at = EXCLUDED.updated_at`,
      [
        context.aggregateId,
        context.userId,
        event.name,
        event.currency,
        event.allowNegative,
        0, // balance starts at 0
        context.eventSeq,
        context.occurredAt,
      ]
    );
  }

  private async projectIncomeRecorded(
    client: PoolClient,
    event: IncomeRecorded,
    context: ProjectionContext
  ): Promise<void> {
    // Update account balance
    await client.query(
      `UPDATE read_accounts
       SET balance_cents = balance_cents + $1,
           last_version = $2,
           updated_at = $3
       WHERE account_id = $4`,
      [event.amountCents, context.eventSeq, context.occurredAt, context.aggregateId]
    );

    // Insert movement
    await client.query(
      `INSERT INTO read_movements (
        account_id, user_id, kind, amount_cents, description,
        occurred_at, event_id, event_seq
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        context.aggregateId,
        context.userId,
        'income',
        event.amountCents,
        event.description || null,
        event.occurredAt,
        context.eventId,
        context.eventSeq,
      ]
    );
  }

  private async projectExpenseRecorded(
    client: PoolClient,
    event: ExpenseRecorded,
    context: ProjectionContext
  ): Promise<void> {
    // Update account balance
    await client.query(
      `UPDATE read_accounts
       SET balance_cents = balance_cents - $1,
           last_version = $2,
           updated_at = $3
       WHERE account_id = $4`,
      [event.amountCents, context.eventSeq, context.occurredAt, context.aggregateId]
    );

    // Insert movement
    await client.query(
      `INSERT INTO read_movements (
        account_id, user_id, kind, amount_cents, description,
        occurred_at, event_id, event_seq
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        context.aggregateId,
        context.userId,
        'expense',
        event.amountCents,
        event.description || null,
        event.occurredAt,
        context.eventId,
        context.eventSeq,
      ]
    );
  }

  private async projectTransferSent(
    client: PoolClient,
    event: TransferSent,
    context: ProjectionContext
  ): Promise<void> {
    // Update source account balance
    await client.query(
      `UPDATE read_accounts
       SET balance_cents = balance_cents - $1,
           last_version = $2,
           updated_at = $3
       WHERE account_id = $4`,
      [event.amountCents, context.eventSeq, context.occurredAt, context.aggregateId]
    );

    // Insert movement for source account
    await client.query(
      `INSERT INTO read_movements (
        account_id, user_id, kind, amount_cents, description,
        occurred_at, transfer_id, event_id, event_seq
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        context.aggregateId,
        context.userId,
        'transfer_out',
        event.amountCents,
        event.description || null,
        event.occurredAt,
        event.transferId,
        context.eventId,
        context.eventSeq,
      ]
    );
  }

  private async projectTransferReceived(
    client: PoolClient,
    event: TransferReceived,
    context: ProjectionContext
  ): Promise<void> {
    // Update destination account balance
    await client.query(
      `UPDATE read_accounts
       SET balance_cents = balance_cents + $1,
           last_version = $2,
           updated_at = $3
       WHERE account_id = $4`,
      [event.amountCents, context.eventSeq, context.occurredAt, context.aggregateId]
    );

    // Insert movement for destination account
    await client.query(
      `INSERT INTO read_movements (
        account_id, user_id, kind, amount_cents, description,
        occurred_at, transfer_id, event_id, event_seq
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        context.aggregateId,
        context.userId,
        'transfer_in',
        event.amountCents,
        event.description || null,
        event.occurredAt,
        event.transferId,
        context.eventId,
        context.eventSeq,
      ]
    );
  }

  private async projectAccountArchived(
    client: PoolClient,
    _event: AccountArchived,
    context: ProjectionContext
  ): Promise<void> {
    // For now, we just update the last_version
    // In a real system, you might want to mark accounts as archived
    await client.query(
      `UPDATE read_accounts
       SET last_version = $1,
           updated_at = $2
       WHERE account_id = $3`,
      [context.eventSeq, context.occurredAt, context.aggregateId]
    );
  }
}

