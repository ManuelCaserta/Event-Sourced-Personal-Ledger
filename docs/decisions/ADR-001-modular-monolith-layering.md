# ADR-001: Modular monolith layering (domain ← application ← infra)

## Context

We want fast local development and a portfolio-friendly codebase, while still enforcing clean boundaries.
The project has event sourcing + CQRS concerns that can easily leak into the domain if not controlled.

## Decision

Adopt a **modular monolith** with strict dependency direction:

```
domain  <-  application  <-  infra
```

- `src/domain`: pure business logic, no I/O
- `src/application`: use-cases orchestrating domain + persistence
- `src/infra`: HTTP, DB, projections, scripts

## Alternatives considered

- **Hexagonal/ports-adapters with separate packages**: more ceremony for a small repo.
- **Monolithic “everything imports everything”**: fastest short-term, but hard to maintain and document.

## Consequences

- Clear file-level ownership and test boundaries.
- Infra complexity (Postgres, swagger, auth) does not pollute the domain.
- Some plumbing code is inevitable (wiring repos, request validation, error mapping).


