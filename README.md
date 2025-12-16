# Event-Sourced Personal Ledger

[![CI](https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/actions/workflows/ci.yml)

A modular monolith implementing an event-sourced personal ledger system.

## Architecture

- **Domain Layer**: Pure business logic, zero I/O
- **Application Layer**: Use cases and orchestration
- **Infrastructure Layer**: HTTP, database, external services

Dependencies flow in one direction: `domain ← application ← infra`

## Tech Stack

- Node.js + TypeScript
- Express
- PostgreSQL
- Event Sourcing

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose (for PostgreSQL)
- PostgreSQL 16+ (if not using Docker)

### Installation

```bash
npm install
```

### Database Setup

1. Start PostgreSQL using Docker Compose:
   ```bash
   docker-compose up -d db
   ```

2. Run migrations:
   ```bash
   npm run db:migrate
   ```

### Development

```bash
# Start dev server with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Unit tests (no DB required)
npm test

# Integration tests (requires DATABASE_URL + Postgres)
npm run test:integration
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT token signing

## Project Structure

```
/src
  /domain          # Pure domain logic (no I/O)
  /application     # Use cases and orchestration
  /infra           # HTTP, DB, external services
  /scripts         # CLI utilities
/docs              # Architecture docs and ADRs
```

## License

MIT

