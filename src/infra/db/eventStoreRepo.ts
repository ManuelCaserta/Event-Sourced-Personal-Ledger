import { pool } from './pool.js';
import type { PoolClient } from 'pg';
import {
  AccountEvent,
  IncomeRecorded,
  ExpenseRecorded,
  TransferSent,
  TransferReceived,
} from '../../domain/ledger/events.js';
import { randomUUID } from 'crypto';
import { Projector, ProjectionContext } from './projector.js';

export interface EventMetadata {
  userId: string;
  correlationId: string;
  causationId?: string;
  requestId?: string;
}

export interface StoredEvent {
  eventSeq: number;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  eventType: string;
  eventVersion: number;
  payload: unknown;
  metadata: EventMetadata;
  occurredAt: Date;
}

export class ConcurrencyError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict: expected version ${expectedVersion}, but actual version is ${actualVersion}`
    );
    this.name = 'ConcurrencyError';
  }
}

export class EventStoreRepo {
  private projector?: Projector;

  constructor(projector?: Projector) {
    this.projector = projector;
  }

  /**
   * Load all events for an aggregate stream.
   */
  async loadStream(
    aggregateType: string,
    aggregateId: string
  ): Promise<StoredEvent[]> {
    const result = await pool.query<{
      event_seq: number;
      event_id: string;
      aggregate_type: string;
      aggregate_id: string;
      version: number;
      event_type: string;
      event_version: number;
      payload: unknown;
      metadata: unknown;
      occurred_at: Date;
    }>(
      `SELECT event_seq, event_id, aggregate_type, aggregate_id, version,
              event_type, event_version, payload, metadata, occurred_at
       FROM events
       WHERE aggregate_type = $1 AND aggregate_id = $2
       ORDER BY version ASC`,
      [aggregateType, aggregateId]
    );

    return result.rows.map((row) => ({
      eventSeq: row.event_seq,
      eventId: row.event_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      version: row.version,
      eventType: row.event_type,
      eventVersion: row.event_version,
      payload: row.payload,
      metadata: row.metadata as EventMetadata,
      occurredAt: row.occurred_at,
    }));
  }

  /**
   * Get the current version of an aggregate stream.
   */
  async getStreamVersion(
    aggregateType: string,
    aggregateId: string
  ): Promise<number> {
    const result = await pool.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), -1) as version
       FROM events
       WHERE aggregate_type = $1 AND aggregate_id = $2`,
      [aggregateType, aggregateId]
    );

    return result.rows[0]?.version ?? -1;
  }

  /**
   * Get the current version using a specific client (for transactions).
   */
  private async getStreamVersionWithClient(
    client: PoolClient,
    aggregateType: string,
    aggregateId: string
  ): Promise<number> {
    const result = await client.query(
      `SELECT COALESCE(MAX(version), -1) as version
       FROM events
       WHERE aggregate_type = $1 AND aggregate_id = $2`,
      [aggregateType, aggregateId]
    );

    return (result.rows[0]?.version as number) ?? -1;
  }

  /**
   * Append events to a stream using an existing client (no transaction management).
   * Throws ConcurrencyError if expectedVersion doesn't match.
   * Used internally by append() and appendMultiple().
   */
  private async appendWithClient(
    client: PoolClient,
    aggregateType: string,
    aggregateId: string,
    events: AccountEvent[],
    expectedVersion: number,
    metadata: EventMetadata
  ): Promise<StoredEvent[]> {
    if (events.length === 0) {
      return [];
    }

    // Check current version within transaction
    const currentVersion = await this.getStreamVersionWithClient(
      client,
      aggregateType,
      aggregateId
    );

    if (currentVersion !== expectedVersion) {
      throw new ConcurrencyError(expectedVersion, currentVersion);
    }

    // Insert events
    const storedEvents: StoredEvent[] = [];
    let nextVersion = expectedVersion + 1;

    for (const event of events) {
      const eventId = randomUUID();
      let eventSeq: number;

      try {
        eventSeq = await this.insertEvent(
          client,
          eventId,
          aggregateType,
          aggregateId,
          nextVersion,
          event,
          metadata
        );
      } catch (error: unknown) {
        // Handle unique constraint violation (Postgres error code 23505)
        // This can happen if version was updated between check and insert
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505'
        ) {
          // Re-check version to get actual value
          const actualVersion = await this.getStreamVersionWithClient(
            client,
            aggregateType,
            aggregateId
          );
          throw new ConcurrencyError(expectedVersion, actualVersion);
        }
        throw error;
      }

      // Extract occurredAt from events that have it
      let occurredAt: Date;
      if (
        event.type === 'IncomeRecorded' ||
        event.type === 'ExpenseRecorded' ||
        event.type === 'TransferSent' ||
        event.type === 'TransferReceived'
      ) {
        occurredAt = (event as IncomeRecorded | ExpenseRecorded | TransferSent | TransferReceived)
          .occurredAt;
      } else {
        occurredAt = new Date();
      }

      storedEvents.push({
        eventSeq,
        eventId,
        aggregateType,
        aggregateId,
        version: nextVersion,
        eventType: event.type,
        eventVersion: event.eventVersion,
        payload: event,
        metadata,
        occurredAt,
      });

      // Project event to read models (synchronous, same transaction)
      if (this.projector) {
        const projectionContext: ProjectionContext = {
          eventSeq,
          eventId,
          aggregateId,
          userId: metadata.userId,
          occurredAt,
        };
        await this.projector.project(client, event, projectionContext);
      }

      nextVersion++;
    }

    return storedEvents;
  }

  /**
   * Append events to a stream with optimistic concurrency control.
   * Throws ConcurrencyError if expectedVersion doesn't match.
   */
  async append(
    aggregateType: string,
    aggregateId: string,
    events: AccountEvent[],
    expectedVersion: number,
    metadata: EventMetadata
  ): Promise<StoredEvent[]> {
    if (events.length === 0) {
      return [];
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const storedEvents = await this.appendWithClient(
        client,
        aggregateType,
        aggregateId,
        events,
        expectedVersion,
        metadata
      );
      await client.query('COMMIT');
      return storedEvents;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Append events to multiple streams atomically in a single transaction.
   * All appends succeed or all fail (rollback).
   * Throws ConcurrencyError if any expectedVersion doesn't match.
   */
  async appendMultiple(
    appends: Array<{
      aggregateType: string;
      aggregateId: string;
      events: AccountEvent[];
      expectedVersion: number;
      metadata: EventMetadata;
    }>
  ): Promise<StoredEvent[][]> {
    if (appends.length === 0) {
      return [];
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const results: StoredEvent[][] = [];

      for (const append of appends) {
        const storedEvents = await this.appendWithClient(
          client,
          append.aggregateType,
          append.aggregateId,
          append.events,
          append.expectedVersion,
          append.metadata
        );
        results.push(storedEvents);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Insert a single event and return its event_seq.
   */
  private async insertEvent(
    client: PoolClient,
    eventId: string,
    aggregateType: string,
    aggregateId: string,
    version: number,
    event: AccountEvent,
    metadata: EventMetadata
  ): Promise<number> {
    // Extract occurredAt from events that have it
    let occurredAt: Date;
    if (
      event.type === 'IncomeRecorded' ||
      event.type === 'ExpenseRecorded' ||
      event.type === 'TransferSent' ||
      event.type === 'TransferReceived'
    ) {
      occurredAt = (event as IncomeRecorded | ExpenseRecorded | TransferSent | TransferReceived)
        .occurredAt;
    } else {
      occurredAt = new Date();
    }

    const result = await client.query(
      `INSERT INTO events (
        event_id, aggregate_type, aggregate_id, version,
        event_type, event_version, payload, metadata, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING event_seq`,
      [
        eventId,
        aggregateType,
        aggregateId,
        version,
        event.type,
        event.eventVersion,
        JSON.stringify(event),
        JSON.stringify(metadata),
        occurredAt,
      ]
    );

    return result.rows[0].event_seq as number;
  }
}

