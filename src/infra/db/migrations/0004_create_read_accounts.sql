-- Migration: Create read_accounts projection table
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS read_accounts (
    account_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    allow_negative BOOLEAN NOT NULL,
    balance_cents BIGINT NOT NULL,
    last_version INT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_read_accounts_user_id ON read_accounts(user_id);
CREATE INDEX idx_read_accounts_user_currency ON read_accounts(user_id, currency);

