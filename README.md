# Event-Sourced Personal Ledger

[![CI](https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/actions/workflows/ci.yml)

Event-sourced personal ledger (TypeScript/Node) built as a **modular monolith**.
Write model uses **event sourcing** + optimistic concurrency; read model is updated via **synchronous projections**.

## Live Demo

- **URL**: `<PASTE_RAILWAY_URL_HERE>`
- **Deploy guide**: `docs/DEPLOYMENT.md`

## Key Features (high-signal)

- **Event store in Postgres** (append-only, per-stream versioning)
- **Optimistic concurrency** via `expectedVersion` + `ConcurrencyError`
- **Atomic transfers** across two aggregates via `appendMultiple(...)`
- **CQRS read models** (`read_accounts`, `read_movements`) updated synchronously inside the same DB transaction
- **Idempotent command handling** (command dedup table)
- **Stable HTTP error contract**: `{ code, message, details? }` + OpenAPI docs

## Docs (fast links)

- **Architecture**: `docs/ARCHITECTURE.md`
- **Decisions (ADRs)**: `docs/decisions/ADR-001-...` → `ADR-005-...`
- **Deployment (Railway)**: `docs/DEPLOYMENT.md`
- **Release checklist**: `docs/RELEASE_CHECKLIST.md`
- **Assets checklist**: `docs/ASSETS.md`
- **Security**: `SECURITY.md`
- **Changelog**: `CHANGELOG.md`
- **License**: `LICENSE`

## Quickstart (Docker)

```bash
docker compose up --build
```

- App: `http://localhost:3000`
- Health: `http://localhost:3000/healthz`
- Docs: `http://localhost:3000/docs`

## Local Quickstart (no Docker)

```bash
npm install

# set DATABASE_URL and JWT_SECRET in your shell / .env
npm run db:migrate
npm run dev
```

## API Quickstart (curl)

```bash
# Register + login
curl -sS -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","password":"password123"}'

TOKEN="$(curl -sS -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","password":"password123"}' | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).token")"

# Create account
curl -sS -X POST http://localhost:3000/api/accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Checking","currency":"USD","allowNegative":false}'
```

## Testing

- **Unit tests (no DB)**:

```bash
npm test
```

- **Integration tests (requires Postgres + `DATABASE_URL`)**:

```bash
npm run db:migrate
npm run test:integration
```

## Repo layout (layering)

```
src/domain        # Pure domain logic (no I/O)
src/application   # Use-cases + orchestration (imports domain + infra)
src/infra         # HTTP, DB, projections
docs/             # Architecture + ADRs + deploy/release guidance
```

## Implementation pointers (real file paths)

- **Event store**: `src/infra/db/eventStoreRepo.ts`
- **Projector**: `src/infra/db/projector.ts`
- **HTTP server** (`/healthz`, `/docs`): `src/infra/http/server.ts`
- **Error mapping**: `src/infra/http/middleware/errorHandler.ts`
- **Migrations**: `src/infra/db/migrations/*.sql`

