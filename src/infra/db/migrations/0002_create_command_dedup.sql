-- Migration: Create command_dedup table for idempotency
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS command_dedup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    correlation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, idempotency_key)
);

CREATE INDEX idx_command_dedup_user_id ON command_dedup(user_id);
CREATE INDEX idx_command_dedup_key ON command_dedup(user_id, idempotency_key);

