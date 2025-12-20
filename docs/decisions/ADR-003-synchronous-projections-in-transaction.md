# ADR-003: Synchronous Projections Within Transaction

## Status

Accepted

## Context

We need read models (`read_accounts`, `read_movements`) for fast queries. Updates must be consistent with the event store.

## Decision

Update projections **synchronously** within the same transaction as event appends.

**Flow**:
1. Begin transaction
2. Append events to `events` table
3. Project each event to read models (same transaction)
4. Commit (or rollback on error)

## Alternatives Considered

1. **Async projections** (event bus): Eventual consistency, simpler writes
2. **Separate projection service**: More infrastructure, eventual consistency
3. **No projections** (query events directly): Too slow for real-time queries

## Consequences

### Positive

- Immediate consistency (no stale reads)
- Simpler architecture (no async infrastructure)
- Atomic updates (events + projections together)

### Negative

- Slower writes (projection updates add latency)
- Tight coupling (can't scale projections independently)
- Rebuild required if projection logic changes

## Implementation

- Projector: `src/infra/db/projector.ts`
- Integration: `EventStoreRepo.appendWithClient()` calls projector
- Rebuild script: `src/scripts/projectionsRebuild.ts`

