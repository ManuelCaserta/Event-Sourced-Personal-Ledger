import { pool } from '../infra/db/pool.js';
import { Projector } from '../infra/db/projector.js';
import { AccountEvent } from '../domain/ledger/events.js';
import dotenv from 'dotenv';

dotenv.config();

interface EventRow {
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
}

interface Metadata {
  userId: string;
  correlationId: string;
  causationId?: string;
  requestId?: string;
}

export async function rebuildProjections(): Promise<void> {
  console.log('Starting projections rebuild...');
  console.warn(
    '⚠️  WARNING: This will wipe all projections and rebuild from events.'
  );
  console.warn(
    '⚠️  Do not run this while writes are happening in production!'
  );

  const client = await pool.connect();
  const projector = new Projector();

  try {
    await client.query('BEGIN');

    // Clear all projections
    console.log('Clearing existing projections...');
    await client.query('TRUNCATE TABLE read_movements CASCADE');
    await client.query('TRUNCATE TABLE read_accounts CASCADE');
    console.log('✓ Projections cleared');

    // Load all events ordered by event_seq
    console.log('Loading events from event store...');
    const eventsResult = await client.query<EventRow>(
      `SELECT event_seq, event_id, aggregate_type, aggregate_id, version,
              event_type, event_version, payload, metadata, occurred_at
       FROM events
       ORDER BY event_seq ASC`
    );

    const events = eventsResult.rows;
    console.log(`Found ${events.length} events to replay`);

    if (events.length === 0) {
      console.log('No events to replay. Rebuild complete.');
      await client.query('COMMIT');
      return;
    }

    // Replay events in order
    let processed = 0;
    const batchSize = 100;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      for (const row of batch) {
        const event = row.payload as AccountEvent;
        const metadata = row.metadata as Metadata;

        // Determine occurredAt
        let occurredAt: Date;
        if (
          event.type === 'IncomeRecorded' ||
          event.type === 'ExpenseRecorded' ||
          event.type === 'TransferSent' ||
          event.type === 'TransferReceived'
        ) {
          occurredAt = (
            event as
              | { occurredAt: Date }
              | { occurredAt?: Date }
          ).occurredAt || row.occurred_at;
        } else {
          occurredAt = row.occurred_at;
        }

        const projectionContext = {
          eventSeq: row.event_seq,
          eventId: row.event_id,
          aggregateId: row.aggregate_id,
          userId: metadata.userId,
          occurredAt,
        };

        await projector.project(client, event, projectionContext);
        processed++;

        if (processed % 1000 === 0) {
          console.log(`Processed ${processed}/${events.length} events...`);
        }
      }
    }

    await client.query('COMMIT');
    console.log(`✓ Rebuild complete. Processed ${processed} events.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rebuild failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('projectionsRebuild.ts')) {
  rebuildProjections()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

