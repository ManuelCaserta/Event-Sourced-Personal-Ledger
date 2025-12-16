-- Migration: Create events table (event store)
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS events (
    event_seq BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    version INT NOT NULL,
    event_type TEXT NOT NULL,
    event_version INT NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregate_type, aggregate_id, version)
);

CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id, version);
CREATE INDEX idx_events_seq ON events(event_seq);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
CREATE INDEX idx_events_type ON events(event_type);

