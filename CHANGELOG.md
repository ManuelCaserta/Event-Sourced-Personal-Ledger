# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-20

### Added

- Event-sourced personal ledger with full audit trail
- Account management (create, list, get)
- Income/expense recording
- Cross-account transfers with atomicity
- JWT authentication (register, login)
- Synchronous projections (`read_accounts`, `read_movements`)
- Optimistic concurrency control
- Command idempotency with result caching
- OpenAPI documentation (`/docs`)
- Health check endpoint (`/healthz`)
- CSV export for movements
- Docker Compose setup
- GitHub Actions CI
- Database migrations
- Projection rebuild script

### Architecture

- Modular monolith with clear layer boundaries
- Event sourcing with PostgreSQL
- CQRS with synchronous projections
- Domain-driven design (aggregates, events)

### Documentation

- Architecture documentation
- ADRs (5 decisions)
- Deployment guide (Railway)
- API quickstart examples

[1.0.0]: https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/releases/tag/v1.0.0

