# Architecture

## Overview

Event-sourced personal ledger built as a **modular monolith** with clear layer boundaries. All state changes are stored as immutable events, enabling full audit trails and time-travel debugging.

## Layer Boundaries

```
┌─────────────────────────────────────┐
│         Infrastructure              │
│  HTTP, DB, External Services        │
└──────────────┬──────────────────────┘
               │ depends on
┌──────────────▼──────────────────────┐
│         Application                  │
│  Use Cases, Orchestration            │
└──────────────┬──────────────────────┘
               │ depends on
┌──────────────▼──────────────────────┐
│           Domain                      │
│  Pure Business Logic (zero I/O)      │
└──────────────────────────────────────┘
```

**Rule**: Dependencies flow in one direction: `domain ← application ← infra`

## Event Sourcing Flow

### Write Path

1. **Command arrives** → HTTP route (`src/infra/http/routes/`)
2. **Validation** → Zod schemas
3. **Use case** → Application service (`src/application/`)
4. **Domain logic** → Aggregate (`src/domain/ledger/account.ts`)
   - Validates business rules
   - Generates events
5. **Event store** → `EventStoreRepo.append()` (`src/infra/db/eventStoreRepo.ts`)
   - Appends events with optimistic concurrency control
   - Projects events to read models (same transaction)
6. **Projection** → Updates `read_accounts` and `read_movements`

### Read Path

1. **Query arrives** → HTTP route
2. **Query service** → `LedgerQueries` (`src/application/ledger/queries.ts`)
3. **Read model** → Direct query to `read_accounts` or `read_movements`

## Event Store Schema

```sql
events (
  event_seq BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE,
  aggregate_type VARCHAR(50),
  aggregate_id UUID,
  version INT,
  event_type VARCHAR(50),
  event_version INT,
  payload JSONB,
  metadata JSONB,
  occurred_at TIMESTAMPTZ
)
```

**Key constraints**:
- `(aggregate_type, aggregate_id, version)` UNIQUE → Optimistic concurrency
- `event_seq` → Global ordering for projections

## Projections

Synchronous projections updated within the same transaction as event writes:

- **`read_accounts`**: Account balances, metadata
- **`read_movements`**: Transaction history (income, expense, transfers)

**Projector** (`src/infra/db/projector.ts`):
- Applies each event type to update read models
- Runs inside `EventStoreRepo.append()` transaction
- Ensures immediate consistency

## Concurrency Control

**Optimistic locking** via version numbers:

1. Load aggregate → get current `version`
2. Generate events → domain logic validates
3. Append with `expectedVersion` → Postgres unique constraint enforces
4. If conflict → `ConcurrencyError` with actual version

**Cross-aggregate atomicity**:
- Transfers use `appendMultiple()` → single transaction for both accounts
- Rollback on any failure → no partial state

## Idempotency

**Command deduplication** via `command_dedup` table:

- `(user_id, idempotency_key)` UNIQUE
- Returns `correlationId` if duplicate
- `createAccount` caches result in `result_jsonb` for retries

## Key Files

- **Domain**: `src/domain/ledger/account.ts` (aggregate)
- **Application**: `src/application/ledger/*.ts` (use cases)
- **Infrastructure**: `src/infra/db/eventStoreRepo.ts` (event store)
- **Projections**: `src/infra/db/projector.ts` (read model updates)

## See Also

- [ADRs](decisions/) - Architectural decision records
- [Deployment](DEPLOYMENT.md) - Production deployment guide

