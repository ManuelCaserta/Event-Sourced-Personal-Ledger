# Release checklist (portfolio)

## Local verification

- Install:
  - `npm install`

- Unit tests (no DB required):
  - `npm test`

## Integration verification (requires Postgres)

- Ensure `DATABASE_URL` is set and points to a running Postgres.
- Run migrations:
  - `npm run db:migrate`
- Run integration tests:
  - `npm run test:integration`


