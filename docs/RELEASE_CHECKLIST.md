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
  - `docker compose up --build`
- Verify:
  - `GET /healthz` returns 200 when DB is up
  - `GET /docs` shows Swagger UI


