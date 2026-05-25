-- ============================================================
-- Migration 002: Ad Sessions (Watch & Earn — Production)
-- Run this in your Supabase SQL editor
-- ============================================================

-- ad_sessions: one row per "Watch Ad" click, tracks full lifecycle
CREATE TABLE IF NOT EXISTS ad_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token   TEXT UNIQUE NOT NULL,
  network_id      TEXT NOT NULL DEFAULT 'monetag',
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
  reward_amount   NUMERIC(10, 6) NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,          -- prevents double-reward on webhook retry
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_ad_sessions_user_id    ON ad_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_sessions_token      ON ad_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_ad_sessions_status     ON ad_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ad_sessions_created_at ON ad_sessions(created_at);

-- Auto-expire stale sessions (run via pg_cron or a scheduled function)
-- UPDATE ad_sessions SET status = 'EXPIRED'
-- WHERE status = 'PENDING' AND expires_at < NOW();

-- Keep the old ad_session_tokens table for backwards compat, just in case
-- No action needed — both tables can coexist.

-- Add postback_secret column to admin_config if not present
ALTER TABLE admin_config
  ADD COLUMN IF NOT EXISTS postback_secret TEXT DEFAULT '';
