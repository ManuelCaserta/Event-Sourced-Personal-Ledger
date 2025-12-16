# Database Migrations

## Setup

1. Start PostgreSQL using Docker Compose:
   ```bash
   docker-compose up -d db
   ```

2. Ensure `DATABASE_URL` is set in your `.env` file:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ledger_db
   ```

3. Run migrations:
   ```bash
   npm run db:migrate
   ```

## Migration Files

Migrations are versioned SQL files in `src/infra/db/migrations/`:
- `0001_create_users.sql` - Users table
- `0002_create_command_dedup.sql` - Idempotency tracking
- `0003_create_events.sql` - Event store
- `0004_create_read_accounts.sql` - Accounts projection
- `0005_create_read_movements.sql` - Movements projection

## Schema Overview

### users
- Primary key: `id` (UUID)
- Unique: `email`
- Indexes: `email`

### command_dedup
- Primary key: `id` (UUID)
- Unique: `(user_id, idempotency_key)`
- Foreign key: `user_id` → `users(id)`
- Indexes: `user_id`, `(user_id, idempotency_key)`

### events
- Primary key: `event_seq` (BIGSERIAL)
- Unique: `event_id`, `(aggregate_type, aggregate_id, version)`
- Indexes: `(aggregate_type, aggregate_id, version)`, `event_seq`, `occurred_at`, `event_type`

### read_accounts
- Primary key: `account_id` (UUID)
- Foreign key: `user_id` → `users(id)`
- Indexes: `user_id`, `(user_id, currency)`

### read_movements
- Primary key: `movement_id` (UUID)
- Foreign key: `user_id` → `users(id)`
- Check constraint: `kind IN ('income', 'expense', 'transfer_in', 'transfer_out')`
- Indexes: `(user_id, account_id, occurred_at DESC)`, `event_seq`, `(account_id, occurred_at DESC)`, `transfer_id` (partial)

