# ADR-005: Idempotency via `command_dedup` with Result Caching

## Status

Accepted

## Context

Clients may retry commands (network failures, timeouts). We must ensure:
1. Commands execute only once
2. Retries return the same result (e.g., `accountId`)

## Decision

Use `command_dedup` table with `result_jsonb` column for result caching.

**Flow**:
1. Client sends command with `Idempotency-Key` header
2. `CommandDedupRepo.beginCommand()` checks `(user_id, idempotency_key)`
3. If duplicate → return cached `result_jsonb`
4. If new → execute command, save result to `result_jsonb`

## Alternatives Considered

1. **No result caching**: Retries fail or create duplicates
2. **Separate result store**: More complexity
3. **Client-side retry logic**: Unreliable

## Consequences

### Positive

- Safe retries (no duplicate side effects)
- Fast duplicate detection (single query)
- Result caching for `createAccount` (returns same `accountId`)

### Negative

- Requires cleanup of old dedup records (future work)
- Only `createAccount` uses result caching (others return correlationId)

## Implementation

- Schema: `src/infra/db/migrations/0006_add_command_dedup_result.sql`
- Repository: `src/infra/db/commandDedupRepo.ts`
- Use case: `src/application/ledger/createAccount.ts`

