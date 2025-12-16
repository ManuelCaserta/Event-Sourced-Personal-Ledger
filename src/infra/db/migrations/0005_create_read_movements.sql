-- Migration: Create read_movements projection table
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS read_movements (
    movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer_in', 'transfer_out')),
    amount_cents BIGINT NOT NULL,
    description TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    transfer_id UUID,
    event_id UUID NOT NULL,
    event_seq BIGINT NOT NULL
);

CREATE INDEX idx_read_movements_user_account ON read_movements(user_id, account_id, occurred_at DESC);
CREATE INDEX idx_read_movements_event_seq ON read_movements(event_seq);
CREATE INDEX idx_read_movements_account ON read_movements(account_id, occurred_at DESC);
CREATE INDEX idx_read_movements_transfer ON read_movements(transfer_id) WHERE transfer_id IS NOT NULL;

