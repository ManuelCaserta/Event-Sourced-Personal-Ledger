# Event-Sourced Personal Ledger

![CI](https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/workflows/CI/badge.svg)

**Event-sourced personal ledger built as a modular monolith. Full audit trail, optimistic concurrency, and idempotent operations.**

[Live Demo](https://YOUR-APP-NAME.up.railway.app) | [Architecture](docs/ARCHITECTURE.md) | [ADRs](docs/decisions/)

## Screenshots

<div align="center">
  <img src="docs/assets/api-docs.png" alt="API Documentation" width="800"/>
  <p><em>Interactive API documentation with Swagger UI</em></p>
</div>

<div align="center">
  <img src="docs/assets/accounts-view.png" alt="Accounts View" width="800"/>
  <p><em>Account management with real-time balances</em></p>
</div>

<div align="center">
  <img src="docs/assets/movements-view.png" alt="Movements View" width="800"/>
  <p><em>Complete transaction history with event sourcing audit trail</em></p>
</div>

## Demo

<div align="center">
  <img src="docs/assets/demo.gif" alt="End-to-End Demo" width="800"/>
  <p><em>Full workflow: Register → Login → Create Account → Record Income → Transfer</em></p>
</div>

## Quick Start

### With Docker (Recommended)

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (min 32 chars)
docker-compose up --build
```

Verify: http://localhost:3000/healthz | http://localhost:3000/docs

### Local Development

```bash
npm install
docker-compose up -d db
npm run db:migrate
npm run dev
```

## API Quickstart

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  | jq -r '.token')

# Create account
ACCOUNT_ID=$(curl -s -X POST http://localhost:3000/api/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Checking","currency":"USD","allowNegative":false}' \
  | jq -r '.accountId')

# Record income
curl -X POST http://localhost:3000/api/accounts/$ACCOUNT_ID/income \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amountCents":10000,"occurredAt":"2024-01-01T00:00:00Z"}'

# Get movements
curl http://localhost:3000/api/accounts/$ACCOUNT_ID/movements \
  -H "Authorization: Bearer $TOKEN"
```

## Testing

```bash
# Unit tests (no DB required)
npm test

# Integration tests (requires DATABASE_URL)
npm run test:integration
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - System design, event sourcing flow, projections
- **[ADRs](docs/decisions/)** - Architectural decision records
- **[Deployment](docs/DEPLOYMENT.md)** - Railway deployment guide
- **[Release Checklist](docs/RELEASE_CHECKLIST.md)** - Pre-release verification steps

## Tech Stack

- **Runtime**: Node.js 20, TypeScript, Express
- **Database**: PostgreSQL 16 (event store + projections)
- **Patterns**: Event Sourcing, CQRS, Modular Monolith
- **Auth**: JWT, Argon2 password hashing
- **Validation**: Zod schemas

## Project Structure

```
src/
  domain/          # Pure business logic (zero I/O)
  application/     # Use cases, orchestration
  infra/           # HTTP, DB, external services
  scripts/         # CLI utilities (migrations, rebuilds)
docs/
  decisions/       # ADRs
  assets/          # Screenshots, demos
```

## License

[MIT](LICENSE) | [Security](SECURITY.md) | [Changelog](CHANGELOG.md)
