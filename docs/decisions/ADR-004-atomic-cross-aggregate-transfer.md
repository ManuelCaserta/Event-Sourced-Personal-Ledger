# ADR-004: Atomic cross-aggregate transfer via `appendMultiple(...)`

## Context

A transfer affects two account aggregates:

- debit (`TransferSent`) on source account
- credit (`TransferReceived`) on destination account

If these are written in two separate transactions, failures can leave partial state (data corruption).

## Decision

Use a single DB transaction to append events to **multiple streams** atomically.

Implementation:

- `EventStoreRepo.appendMultiple(...)` wraps multiple `appendWithClient(...)` calls in one `BEGIN/COMMIT`
- `TransferUseCase` uses `appendMultiple(...)` to write both sides in one atomic operation

Relevant code:

- `src/infra/db/eventStoreRepo.ts`
- `src/application/ledger/transfer.ts`

## Alternatives considered

- **Saga/outbox**: more scalable, but explicitly out of scope.
- **Best-effort sequential appends**: unacceptable correctness risk.

## Consequences

- Transfers are strongly consistent at the DB level.
- Still uses optimistic concurrency per stream (`expectedVersion` per append).


