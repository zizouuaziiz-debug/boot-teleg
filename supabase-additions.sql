-- ═══════════════════════════════════════════════════════════════
--  GoldenTask — Migration Script for Existing Databases
--  Run ONLY if you already have an existing schema.
--  For fresh installs, use supabase-schema.sql instead.
-- ═══════════════════════════════════════════════════════════════

-- Add webhook idempotency table
CREATE TABLE IF NOT EXISTS webhook_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key   TEXT        UNIQUE NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_key ON webhook_events(event_key);
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
--  Spin state  (BUG FIX: change last_reset to DATE type so
--  the daily-reset comparison in the API route works correctly)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_spin_state (
  user_id     UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spins_used  INTEGER NOT NULL DEFAULT 0,
  last_reset  DATE    NOT NULL DEFAULT CURRENT_DATE
);
ALTER TABLE user_spin_state ENABLE ROW LEVEL SECURITY;

-- If the table already exists with TIMESTAMPTZ, migrate it to DATE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_spin_state'
      AND column_name = 'last_reset'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE user_spin_state
      ALTER COLUMN last_reset TYPE DATE USING last_reset::DATE;
  END IF;
END$$;

-- Add daily bonus table
CREATE TABLE IF NOT EXISTS user_daily_bonus (
  user_id          UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_claim_date  DATE,
  current_day      INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_daily_bonus ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
--  Watch & Earn Ads — daily watch state per user
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_ad_watch_state (
  user_id     UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ads_watched INTEGER NOT NULL DEFAULT 0,
  last_reset  DATE    NOT NULL DEFAULT CURRENT_DATE,
  last_ad_at  TIMESTAMPTZ
);
ALTER TABLE user_ad_watch_state ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
--  Watch & Earn Ads — one-time session tokens (anti-replay)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_session_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',  -- pending | claimed | expired
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);
ALTER TABLE ad_session_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ad_session_tokens_token   ON ad_session_tokens(token);
CREATE INDEX IF NOT EXISTS idx_ad_session_tokens_user_id ON ad_session_tokens(user_id);

-- Automatically expire old pending tokens (run via pg_cron or a periodic job)
-- DELETE FROM ad_session_tokens WHERE expires_at < NOW() AND status = 'pending';

-- ─────────────────────────────────────────────────────────────
--  admin_config — new columns for Watch & Earn Ads
-- ─────────────────────────────────────────────────────────────
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS spin_daily_limit    INTEGER          DEFAULT 3;
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS max_daily_ads       INTEGER          DEFAULT 5;
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS reward_per_ad       DECIMAL(18,8)    DEFAULT 0.05;
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS ad_cooldown_seconds INTEGER          DEFAULT 30;
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS deposit_addresses   JSONB            DEFAULT '{}';
ALTER TABLE admin_config ADD COLUMN IF NOT EXISTS nowpayments_config  JSONB            DEFAULT '{}';

-- Add missing transaction columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS admin_note  TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);

-- Add videos updated_at
ALTER TABLE videos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add user status column
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Ensure admin_config row exists
INSERT INTO admin_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable Realtime on wallets (for broadcast)
ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
