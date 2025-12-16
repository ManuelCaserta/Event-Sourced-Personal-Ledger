# Release checklist (portfolio)

## Local verification

- Install:
  - `npm install`

- Unit tests (no DB required):
  - `npm test`

- Lint + typecheck:
  - `npm run lint`
  - `npm run typecheck`

- Build:
  - `npm run build`

## Integration verification (requires Postgres)

- Ensure `DATABASE_URL` is set and points to a running Postgres.
- Run migrations:
  - `npm run db:migrate`
- Run integration tests:
  - `npm run test:integration`

## Docker verification

- Build image:
  - `docker build .`
- Run app + db:
  - `docker compose up --build -d`
- Verify:
  - `GET /healthz` returns 200 when DB is up
  - `GET /docs` shows Swagger UI

### Windows (PowerShell) quick verification commands

```powershell
# Build + start containers
docker build .
docker compose up --build -d
docker compose ps

# Health + docs
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz).Content
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/docs).StatusCode

# Unit tests (no DB)
npm test

# Integration tests (compose DB on localhost:5432)
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ledger'
$env:JWT_SECRET='test-secret'
npm run test:integration
```


