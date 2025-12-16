# ADR-003: Synchronous projections within the same DB transaction

## Context

For a personal ledger UI, it’s desirable that read models are immediately consistent after a write.
Async projection pipelines (queues/outbox) add complexity and failure modes.

## Decision

Update CQRS read models **synchronously** inside the same Postgres transaction used to append events.

Implementation:

- `EventStoreRepo.appendWithClient(...)` projects each event using a `Projector` if provided
- `Projector.project(...)` updates `read_accounts` and `read_movements`

Relevant code:

- `src/infra/db/eventStoreRepo.ts`
- `src/infra/db/projector.ts`

## Alternatives considered

- **Async projector (queue/outbox)**: more realistic for high scale, but not required here.
- **Read from event store on queries**: slower and more complex for pagination/exports.

## Consequences

- Strong consistency between writes and queries.
- Write latency includes projection work.
- Projection logic must be deterministic and safe to replay.


