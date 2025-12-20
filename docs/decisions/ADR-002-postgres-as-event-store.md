# ADR-002: Postgres as Event Store

## Status

Accepted

## Context

We need an event store that supports:
- ACID transactions (for projections)
- Optimistic concurrency control
- Queryable event history
- No additional infrastructure

## Decision

Use PostgreSQL as the event store with a simple `events` table.

**Schema**:
- `event_seq` (BIGSERIAL) for global ordering
- `(aggregate_type, aggregate_id, version)` UNIQUE for concurrency
- `payload JSONB` for event data

## Alternatives Considered

1. **Dedicated event store** (EventStore, Axon): Overkill for this scale
2. **MongoDB**: No ACID guarantees for cross-aggregate transactions
3. **File-based**: No concurrency control, harder to query

## Consequences

### Positive

- Single database for events + projections
- ACID transactions for atomic projections
- Standard SQL queries for debugging
- No additional infrastructure

### Negative

- Event store and projections share same DB (potential contention)
- No built-in event store features (snapshots, etc.)

## Implementation

- Event store: `src/infra/db/eventStoreRepo.ts`
- Schema: `src/infra/db/migrations/0003_create_events.sql`

