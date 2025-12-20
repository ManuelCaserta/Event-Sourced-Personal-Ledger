# ADR-004: Atomic Cross-Aggregate Transfer via `appendMultiple`

## Status

Accepted

## Context

Transfers must update two aggregates (from account, to account) atomically. Partial state (one account updated, other not) is unacceptable.

## Decision

Use `EventStoreRepo.appendMultiple()` to append events to multiple aggregates in a **single transaction**.

**Flow**:
1. Load both aggregates
2. Generate events (debit + credit)
3. `appendMultiple([fromAppend, toAppend])` → single DB transaction
4. Rollback on any failure

## Alternatives Considered

1. **Saga pattern**: Complex, eventual consistency
2. **Outbox pattern**: More infrastructure, eventual consistency
3. **Two sequential appends**: Risk of partial state (rejected)

## Consequences

### Positive

- Guaranteed atomicity (all-or-nothing)
- Simple implementation (single transaction)
- Immediate consistency

### Negative

- Requires transaction support (Postgres)
- Can't scale aggregates across databases
- Longer transaction duration (two appends)

## Implementation

- `EventStoreRepo.appendMultiple()`: `src/infra/db/eventStoreRepo.ts`
- `TransferUseCase`: `src/application/ledger/transfer.ts`

