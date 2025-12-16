# Architecture

This codebase is a **modular monolith** with strict layering:

```
domain  <-  application  <-  infra
```

- `src/domain`: pure business rules (no I/O)
- `src/application`: use-cases (orchestrates domain + persistence)
- `src/infra`: HTTP, Postgres, projections, scripts

## Big picture (CQRS + Event Sourcing)

**Write model**

- Commands hit HTTP routes (`src/infra/http/routes/*.ts`)
- Use-cases validate invariants via domain aggregates (e.g. `src/domain/ledger/account.ts`)
- State changes are emitted as **events** and persisted in the **event store** (`src/infra/db/eventStoreRepo.ts`)

**Read model**

- A synchronous **projector** updates read tables inside the same DB transaction as the event append
  - Projector: `src/infra/db/projector.ts`
  - Read tables: `read_accounts`, `read_movements` (migrations `src/infra/db/migrations/0004_*.sql`, `0005_*.sql`)

## Write path sequence (happy path)

1. HTTP request → route handler
2. Use-case loads stream with `EventStoreRepo.loadStream(...)`
3. Aggregate reconstructed via `Account.fromEvents(...)`
4. Aggregate method produces an event (e.g. `recordExpense`, `recordTransferSent`)
5. Use-case appends events with optimistic concurrency:
   - single stream: `EventStoreRepo.append(...)`
   - multi stream (transfer): `EventStoreRepo.appendMultiple(...)`
6. Within the same transaction, projector updates read models
7. Response uses stable error contract on failures (`ErrorResponse`)

## Event store schema (summary)

Events are stored in Postgres in an append-only `events` table (see `src/infra/db/migrations/0003_create_events.sql`).

Key properties:

- **Per-stream version**: `(aggregate_type, aggregate_id, version)` supports optimistic concurrency via `expectedVersion`
- **Global ordering**: `event_seq` supports rebuild/replay ordering
- **Metadata**: `userId`, `correlationId` (and optional causation/request IDs)

## Concurrency & atomicity

- **Single-stream concurrency**: `append(...)` checks current stream version and throws `ConcurrencyError` on mismatch.
- **Cross-aggregate atomicity** (transfer): `appendMultiple(...)` wraps multiple stream appends in **one DB transaction**.

Relevant code:

- `src/infra/db/eventStoreRepo.ts` (`appendWithClient`, `appendMultiple`)
- `src/application/ledger/transfer.ts` (uses `appendMultiple`)

## Idempotency

Commands accept an idempotency key and are deduplicated via `command_dedup` (migration `0002_create_command_dedup.sql`).

Repository: `src/infra/db/commandDedupRepo.ts`

## HTTP layer contracts

- **Auth**: JWT bearer auth via `Authorization: Bearer <token>`
- **Errors**: stable shape

```json
{ "code": "SOME_CODE", "message": "Human message", "details": { } }
```

Implementation:

- `src/infra/http/middleware/errorHandler.ts`
- OpenAPI: `src/infra/http/swagger.ts` + JSDoc `@openapi` in routes

## Operational notes

- `/healthz` performs a DB ping (`SELECT 1`) with a short timeout (~2s)
- Rebuild projections (dev): `npm run projections:rebuild` (`src/scripts/projectionsRebuild.ts`)


