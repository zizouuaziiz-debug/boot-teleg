# GoldenTask — Deployment Guide

## Prerequisites
- Supabase project (free tier works)
- Vercel account
- Telegram Bot Token (from @BotFather)
- NOWPayments account (optional, for automated crypto payments)

## Step 1 — Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** and run `supabase-schema.sql` (full install) or `supabase-additions.sql` (existing DB)
3. In **Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
4. In **Realtime**, enable broadcasts (no extra config needed — schema handles it)

## Step 2 — Vercel Deployment

1. Push this repo to GitHub
2. Import into Vercel → select **Next.js** framework
3. Add all environment variables from `.env.example` in Vercel dashboard
4. Deploy

## Step 3 — Telegram Bot Setup

1. Message @BotFather → `/newbot` → get your `TELEGRAM_BOT_TOKEN`
2. Set your Vercel URL as the Mini App URL:
   ```
   /setmenubutton → your-app.vercel.app
   ```
3. Enable Web App:
   ```
   /newapp → link to your Vercel URL
   ```

## Step 4 — NOWPayments (Optional)

1. Create account at https://nowpayments.io
2. Get API key from dashboard
3. Set IPN Secret in payment settings
4. Add both to Vercel env vars
5. Set IPN callback URL to: `https://your-app.vercel.app/api/webhooks/nowpayments`

## Step 5 — Admin Panel

1. Visit `https://your-app.vercel.app/admin`
2. Login with the password set in `ADMIN_SECRET` env var
3. Configure:
   - **Deposit addresses** for TRC20/ERC20/BEP20 (if not using NOWPayments)
   - **Videos** to earn from
   - **Tasks** for users to complete
   - **Mining** rates and durations
   - **VIP** levels and prices
   - **Spin** daily limit and prize wheel

## Realtime Balance Updates

The app uses Supabase Realtime Broadcast for instant balance updates:
- Server broadcasts to channel `wallet:{userId}` after every wallet mutation
- Client subscribes via the `useRealtimeWallet` hook in `hooks/use-realtime-wallet.ts`
- No RLS issues — uses Broadcast (not postgres_changes)
- Requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` to be set

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` is only used server-side in API routes — never exposed to clients
- `ADMIN_SECRET` protects the admin panel — use a strong random value (32+ chars)
- NOWPayments webhook uses HMAC signature verification
- All webhook events are idempotent (stored in `webhook_events` table)
