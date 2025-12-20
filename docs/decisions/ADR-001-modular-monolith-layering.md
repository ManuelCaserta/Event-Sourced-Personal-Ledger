# ADR-001: Modular Monolith Layering

## Status

Accepted

## Context

We need clear boundaries between business logic, application orchestration, and infrastructure concerns. The system must be testable and maintainable without over-engineering.

## Decision

Organize code into three layers with strict dependency rules:

1. **Domain** (`src/domain/`): Pure business logic, zero I/O
2. **Application** (`src/application/`): Use cases, orchestration
3. **Infrastructure** (`src/infra/`): HTTP, database, external services

**Dependency rule**: `domain ← application ← infra` (one direction only)

## Consequences

### Positive

- Domain logic is testable without database/HTTP
- Clear separation of concerns
- Easy to extract services later if needed
- Type-safe boundaries via TypeScript

### Negative

- Some duplication (e.g., domain errors vs HTTP errors)
- Requires discipline to avoid shortcuts

## Implementation

- Domain aggregates: `src/domain/ledger/account.ts`
- Use cases: `src/application/ledger/createAccount.ts`
- Repositories: `src/infra/db/eventStoreRepo.ts`

