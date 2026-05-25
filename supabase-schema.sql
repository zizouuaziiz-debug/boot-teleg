-- ═══════════════════════════════════════════════════════════════
--  GoldenTask — Complete Supabase Schema v3
--  Run this ONCE in Supabase SQL Editor for fresh installs.
--  For existing DBs, use supabase-additions.sql instead.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   TEXT          UNIQUE NOT NULL,
  username      TEXT,
  first_name    TEXT,
  last_name     TEXT,
  photo_url     TEXT,
  referral_code TEXT          UNIQUE,
  referred_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  vip_level     INTEGER       NOT NULL DEFAULT 0,
  status        TEXT          NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id   ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- ─── Wallets ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance          DECIMAL(18,8) NOT NULL DEFAULT 0,
  total_earned     DECIMAL(18,8) NOT NULL DEFAULT 0,
  total_withdrawn  DECIMAL(18,8) NOT NULL DEFAULT 0,
  coins            BIGINT        NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- ─── Transactions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL,
  amount      DECIMAL(18,8) NOT NULL,
  status      TEXT          NOT NULL DEFAULT 'pending',
  source      TEXT,
  address     TEXT,
  admin_note  TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status     ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_source     ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- ─── Webhook Events (idempotency) ────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key   TEXT        UNIQUE NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_key ON webhook_events(event_key);

-- ─── Referrals ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID          UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  earnings    DECIMAL(18,8) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);

-- ─── Videos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT          NOT NULL,
  company      TEXT,
  youtube_url  TEXT          NOT NULL,
  thumbnail    TEXT,
  reward       DECIMAL(18,8) NOT NULL DEFAULT 0.05,
  duration     INTEGER       NOT NULL DEFAULT 30,
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── Video Watches ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_watches (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id    UUID          NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  reward      DECIMAL(18,8) NOT NULL DEFAULT 0,
  watched_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_watches_user_id    ON video_watches(user_id);
CREATE INDEX IF NOT EXISTS idx_video_watches_video_id   ON video_watches(video_id);
CREATE INDEX IF NOT EXISTS idx_video_watches_watched_at ON video_watches(watched_at DESC);

-- ─── Mining Sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mining_sessions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id          TEXT          NOT NULL DEFAULT 'basic',
  status           TEXT          NOT NULL DEFAULT 'active',
  rate             DECIMAL(10,6) NOT NULL DEFAULT 0.01,
  duration_hours   INTEGER       NOT NULL DEFAULT 8,
  balance_at_start DECIMAL(18,8) NOT NULL DEFAULT 0,
  earned           DECIMAL(18,8),
  started_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_user_id ON mining_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_status  ON mining_sessions(status);

-- ─── Spin State ──────────────────────────────────────────────
-- Uses DATE type for last_reset so daily comparison works correctly.
CREATE TABLE IF NOT EXISTS user_spin_state (
  user_id     UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spins_used  INTEGER NOT NULL DEFAULT 0,
  last_reset  DATE    NOT NULL DEFAULT CURRENT_DATE
);

-- ─── Daily Bonus ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_daily_bonus (
  user_id          UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_claim_date  DATE,
  current_day      INTEGER     NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tasks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT          NOT NULL,
  description TEXT,
  type        TEXT          NOT NULL DEFAULT 'social',
  action_url  TEXT,
  reward      DECIMAL(18,8) NOT NULL DEFAULT 0,
  icon        TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── User Tasks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tasks (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed    BOOLEAN     NOT NULL DEFAULT false,
  progress     INTEGER     NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user_id ON user_tasks(user_id);

-- ─── Watch & Earn Ads — daily watch state per user ────────────
CREATE TABLE IF NOT EXISTS user_ad_watch_state (
  user_id     UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ads_watched INTEGER NOT NULL DEFAULT 0,
  last_reset  DATE    NOT NULL DEFAULT CURRENT_DATE,
  last_ad_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_ad_watch_state_user_id ON user_ad_watch_state(user_id);

-- ─── Watch & Earn Ads — one-time session tokens (anti-replay) ─
CREATE TABLE IF NOT EXISTS ad_session_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',  -- pending | claimed | expired
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);
CREATE INDEX IF NOT EXISTS idx_ad_session_tokens_token   ON ad_session_tokens(token);
CREATE INDEX IF NOT EXISTS idx_ad_session_tokens_user_id ON ad_session_tokens(user_id);

-- ─── Admin Config (single row) ───────────────────────────────
CREATE TABLE IF NOT EXISTS admin_config (
  id                  INTEGER       PRIMARY KEY DEFAULT 1,
  min_withdrawal      DECIMAL(18,8) NOT NULL DEFAULT 10,
  daily_video_limit   INTEGER       NOT NULL DEFAULT 50,
  referral_commission DECIMAL(5,2)  NOT NULL DEFAULT 10,
  reward_per_video    DECIMAL(18,8) NOT NULL DEFAULT 0.05,
  max_daily_earnings  DECIMAL(18,8) NOT NULL DEFAULT 25,
  cooldown_seconds    INTEGER       NOT NULL DEFAULT 30,
  min_watch_percent   INTEGER       NOT NULL DEFAULT 80,
  vip_multiplier      DECIMAL(5,2)  NOT NULL DEFAULT 1.5,
  spin_daily_limit    INTEGER       NOT NULL DEFAULT 3,
  -- Watch & Earn Ads
  max_daily_ads       INTEGER       NOT NULL DEFAULT 5,
  reward_per_ad       DECIMAL(18,8) NOT NULL DEFAULT 0.05,
  ad_cooldown_seconds INTEGER       NOT NULL DEFAULT 30,
  -- Advanced config (JSONB)
  mining_config       JSONB         NOT NULL DEFAULT '{}',
  vip_config          JSONB         NOT NULL DEFAULT '[]',
  ad_networks         JSONB         NOT NULL DEFAULT '{}',
  deposit_addresses   JSONB         NOT NULL DEFAULT '{}',
  nowpayments_config  JSONB         NOT NULL DEFAULT '{}',
  password_hash       TEXT,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO admin_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── Enable Realtime on wallets table ────────────────────────
-- Required for Supabase Broadcast to work with wallet:userId channels.
ALTER PUBLICATION supabase_realtime ADD TABLE wallets;

-- ─── Row Level Security ──────────────────────────────────────
-- All queries from Next.js use the service role key and bypass RLS.
-- RLS is enabled as a safety net in case the anon key is ever used.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_watches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_spin_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_bonus    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ad_watch_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_session_tokens   ENABLE ROW LEVEL SECURITY;
