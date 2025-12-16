# ADR-002: Postgres as the event store

## Context

Event sourcing needs an append-only persistence layer with:

- ordered events per stream
- optimistic concurrency (`expectedVersion`)
- ability to replay all events (rebuild projections)

We also want the simplest operational footprint.

## Decision

Use **PostgreSQL** as the event store.

Implementation:

- Event repository: `src/infra/db/eventStoreRepo.ts`
- Migrations: `src/infra/db/migrations/0003_create_events.sql`

## Alternatives considered

- **Kafka / event streaming**: overkill and adds infra complexity.
- **Dedicated event store DB**: not necessary for this scope.

## Consequences

- Simple local + CI setup (single Postgres).
- Strong transactional guarantees for synchronous projections.
- Must be careful with schema constraints and indexing (stream version uniqueness, ordering).


