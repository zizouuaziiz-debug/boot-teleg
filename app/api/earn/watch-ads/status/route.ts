import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const DEFAULT_MAX_ADS       = 5;
const DEFAULT_REWARD_PER_AD = 0.05;
const DEFAULT_COOLDOWN_SECS = 30;

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

/**
 * GET /api/earn/watch-ads/status
 *
 * Two modes:
 *  1. ?token=<sessionToken>  →  returns the status of a specific ad session
 *     (used by frontend polling after launching the ad)
 *  2. No token              →  returns the user's daily watch summary
 *     (used by EarnScreen on load)
 */
export async function GET(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const token = req.nextUrl.searchParams.get("token");

  // ── Mode 1: session-specific status (polling) ─────────────────────────────
  if (token) {
    const { data: session } = await supabase
      .from("ad_sessions")
      .select("session_token, status, reward_amount, completed_at, expires_at")
      .eq("session_token", token)
      .eq("user_id", user.id)       // security: ensure token belongs to this user
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Auto-mark expired sessions
    if (session.status === "PENDING" && new Date(session.expires_at) < new Date()) {
      await supabase
        .from("ad_sessions")
        .update({ status: "EXPIRED" })
        .eq("session_token", token);

      return NextResponse.json({
        sessionToken: token,
        status: "EXPIRED",
        rewardAmount: 0,
      });
    }

    return NextResponse.json({
      sessionToken:  token,
      status:        session.status,
      rewardAmount:  Number(session.reward_amount),
      completedAt:   session.completed_at ?? null,
    });
  }

  // ── Mode 2: daily summary ─────────────────────────────────────────────────
  const { data: cfg } = await supabase
    .from("admin_config")
    .select("max_daily_ads, reward_per_ad, ad_cooldown_seconds")
    .eq("id", 1).maybeSingle();

  const maxAds       = Number(cfg?.max_daily_ads       ?? DEFAULT_MAX_ADS);
  const rewardPerAd  = Number(cfg?.reward_per_ad       ?? DEFAULT_REWARD_PER_AD);
  const cooldownSecs = Number(cfg?.ad_cooldown_seconds ?? DEFAULT_COOLDOWN_SECS);
  const todayKey     = getTodayKey();

  const { data: state } = await supabase
    .from("user_ad_watch_state").select("*").eq("user_id", user.id).maybeSingle();

  let adsWatched = 0;
  let lastAdAt: string | null = null;

  if (state) {
    const storedDate = state.last_reset ? String(state.last_reset).split("T")[0] : null;
    if (storedDate === todayKey) {
      adsWatched = Number(state.ads_watched ?? 0);
      lastAdAt   = state.last_ad_at ?? null;
    }
  }

  let cooldownRemaining = 0;
  if (lastAdAt) {
    const elapsed = Math.floor((Date.now() - new Date(lastAdAt).getTime()) / 1000);
    cooldownRemaining = Math.max(0, cooldownSecs - elapsed);
  }

  return NextResponse.json({
    adsWatched,
    maxAds,
    remaining:        Math.max(0, maxAds - adsWatched),
    canWatch:         adsWatched < maxAds && cooldownRemaining === 0,
    cooldownRemaining,
    cooldownDuration: cooldownSecs,
    rewardPerAd,
    lastAdAt,
  });
}
