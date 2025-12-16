# ADR-005: Idempotency via `command_dedup`

## Context

HTTP clients retry requests (timeouts, network failures). Write endpoints must be safe to retry without duplicating events.

## Decision

Store idempotency keys per user in a `command_dedup` table and reject duplicates.

Implementation:

- Table: `src/infra/db/migrations/0002_create_command_dedup.sql`
- Repo: `src/infra/db/commandDedupRepo.ts` (`beginCommand(userId, idempotencyKey)`)
- Use-cases call `beginCommand(...)` before writing events.

## Alternatives considered

- **Rely on client-side only**: not safe.
- **Cache layer**: adds infra and eviction complexity.

## Consequences

- Repeat calls with the same key are deduplicated.
- To return the exact same result on retries, you may store a result payload (not implemented here).


