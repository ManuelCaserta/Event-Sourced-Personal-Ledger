# Release Checklist

## Pre-Release Verification

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Type checking**
   ```bash
   npm run typecheck
   ```
   ✅ Should pass with no errors

3. **Linting**
   ```bash
   npm run lint
   ```
   ✅ Should pass (warnings acceptable)

4. **Unit tests (no database required)**
   ```bash
   npm test
   ```
   ✅ Should pass all unit tests

5. **Build**
   ```bash
   npm run build
   ```
   ✅ Should compile successfully

### Integration Testing (requires database)

1. **Start database**
   ```bash
   docker-compose up -d db
   ```

2. **Run migrations**
   ```bash
   npm run db:migrate
   ```
   ✅ Should apply all migrations

3. **Set environment variables**
   ```bash
   export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ledger'
   export JWT_SECRET='local-test-secret'
   ```

4. **Run integration tests**
   ```bash
   npm run test:integration
   ```
   ✅ Should pass all integration tests

5. **Verify health check**
   ```bash
   curl http://localhost:3000/healthz
   ```
   ✅ Should return `200 {"status":"ok"}`

6. **Verify API docs**
   ```bash
   curl http://localhost:3000/docs
   ```
   ✅ Should return Swagger UI HTML

### Docker Verification

1. **Build Docker image**
   ```bash
   docker build -t ledger-app .
   ```
   ✅ Should build successfully

2. **Run with docker-compose**
   ```bash
   docker-compose up --build
   ```
   ✅ Both `db` and `app` services should be healthy

3. **Verify endpoints**
   - `http://localhost:3000/healthz` → 200
   - `http://localhost:3000/docs` → Swagger UI

## Test Strategy

- **Unit tests** (`npm test`): Run without database, test domain logic only
- **Integration tests** (`npm run test:integration`): Require `DATABASE_URL`, test full stack

## Notes

- Unit tests exclude `*.int.test.ts` files automatically
- Integration tests require `DATABASE_URL` and `JWT_SECRET` environment variables
- Integration tests run sequentially to avoid database conflicts

