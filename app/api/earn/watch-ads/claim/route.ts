import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

/**
 * POST /api/earn/watch-ads/claim
 *
 * FALLBACK ONLY — used when the Monetag postback webhook fails or times out.
 * Called by the frontend after the ad player timer runs out (~30s).
 *
 * Security notes:
 * - The wallet is still only credited from the backend (never the frontend).
 * - Idempotency: won't double-reward if the postback already completed the session.
 * - Session must be PENDING and not expired.
 */
export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { token } = body as { token?: string };
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // ── Resolve user ──────────────────────────────────────────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("id, status, vip_level")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.status === "banned" || user.status === "suspended") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  // ── Find session ──────────────────────────────────────────────────────────
  const { data: session } = await supabase
    .from("ad_sessions")
    .select("id, user_id, status, reward_amount, expires_at")
    .eq("session_token", token)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!session) {
    // Fallback: try old ad_session_tokens table for backwards compat
    return await claimLegacyToken(req, supabase, telegramId, token, user);
  }

  // ── Idempotency: already completed → return success ───────────────────────
  if (session.status === "COMPLETED") {
    return NextResponse.json({
      success:  true,
      reward:   Number(session.reward_amount),
      idempotent: true,
    });
  }

  if (session.status === "FAILED" || session.status === "EXPIRED") {
    return NextResponse.json({ error: `Session is ${session.status}` }, { status: 400 });
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("ad_sessions").update({ status: "EXPIRED" }).eq("id", session.id);
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  // ── Atomic claim ──────────────────────────────────────────────────────────
  const { data: claimed } = await supabase
    .from("ad_sessions")
    .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "PENDING")   // optimistic lock — prevents race with postback
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Postback beat us — re-fetch and return success
    const { data: updated } = await supabase
      .from("ad_sessions")
      .select("status, reward_amount")
      .eq("id", session.id)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      reward:  Number(updated?.reward_amount ?? session.reward_amount),
      idempotent: true,
    });
  }

  // ── Credit wallet ─────────────────────────────────────────────────────────
  const reward = Number(session.reward_amount);
  const now    = new Date().toISOString();
  const todayKey = now.split("T")[0];

  const { data: cfg } = await supabase
    .from("admin_config")
    .select("vip_multiplier, ad_cooldown_seconds")
    .eq("id", 1)
    .maybeSingle();

  const vipMult      = user.vip_level > 0 ? Number(cfg?.vip_multiplier ?? 1.5) : 1;
  const finalReward  = Math.round(reward * vipMult * 1e8) / 1e8;
  const cooldownSecs = Number(cfg?.ad_cooldown_seconds ?? 30);

  const { data: wallet } = await supabase
    .from("wallets").select("*").eq("user_id", user.id).maybeSingle();

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 500 });
  }

  const newWallet = {
    balance:         Math.round((Number(wallet.balance)      + finalReward) * 1e8) / 1e8,
    total_earned:    Math.round((Number(wallet.total_earned) + finalReward) * 1e8) / 1e8,
    total_withdrawn: Number(wallet.total_withdrawn || 0),
    coins:           Number(wallet.coins || 0),
    updated_at:      now,
  };

  await supabase.from("wallets").update(newWallet).eq("user_id", user.id);

  await supabase.from("transactions").insert({
    user_id:    user.id,
    type:       "earning",
    amount:     finalReward,
    status:     "completed",
    source:     `watch_ad_fallback:${token.slice(0, 12)}`,
    created_at: now,
  });

  // ── Update daily state ────────────────────────────────────────────────────
  const { data: state } = await supabase
    .from("user_ad_watch_state")
    .select("ads_watched, last_reset")
    .eq("user_id", user.id)
    .maybeSingle();

  const isToday       = state && String(state.last_reset).split("T")[0] === todayKey;
  const currentWatched = isToday ? Number(state!.ads_watched ?? 0) : 0;

  await supabase.from("user_ad_watch_state").upsert({
    user_id:     user.id,
    ads_watched: currentWatched + 1,
    last_reset:  todayKey,
    last_ad_at:  now,
  }, { onConflict: "user_id" });

  await broadcastWalletUpdate(user.id, newWallet).catch(() => {});

  // Load fresh status for response
  const { data: freshStatus } = await supabase
    .from("user_ad_watch_state")
    .select("ads_watched")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: cfgMax } = await supabase
    .from("admin_config").select("max_daily_ads").eq("id", 1).maybeSingle();
  const maxAds = Number(cfgMax?.max_daily_ads ?? 5);
  const adsWatched = Number(freshStatus?.ads_watched ?? currentWatched + 1);

  return NextResponse.json({
    success:      true,
    reward:       finalReward,
    newBalance:   newWallet.balance,
    adsWatched,
    maxAds,
    remaining:    Math.max(0, maxAds - adsWatched),
    cooldownDuration: cooldownSecs,
  });
}

// ── Legacy fallback for old ad_session_tokens table ───────────────────────────
async function claimLegacyToken(
  req: NextRequest,
  supabase: ReturnType<typeof import("@/lib/supabase")["getSupabaseAdmin"]>,
  telegramId: string,
  token: string,
  user: { id: string; vip_level: number }
): Promise<NextResponse> {
  const { data: legacySession } = await supabase
    .from("ad_session_tokens")
    .update({ status: "claimed" })
    .eq("token", token)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select()
    .maybeSingle();

  if (!legacySession) {
    const { data: existing } = await supabase
      .from("ad_session_tokens").select("status").eq("token", token).maybeSingle();
    const reason = !existing ? "Invalid token"
      : existing.status === "claimed" ? "Token already used"
      : "Token expired";
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const { data: cfg } = await supabase
    .from("admin_config")
    .select("max_daily_ads, reward_per_ad, ad_cooldown_seconds, vip_multiplier")
    .eq("id", 1).maybeSingle();

  const baseReward   = Number(cfg?.reward_per_ad       ?? 0.05);
  const cooldownSecs = Number(cfg?.ad_cooldown_seconds ?? 30);
  const maxAds       = Number(cfg?.max_daily_ads       ?? 5);
  const vipMult      = user.vip_level > 0 ? Number(cfg?.vip_multiplier ?? 1.5) : 1;
  const reward       = Math.round(baseReward * vipMult * 1e8) / 1e8;
  const now          = new Date().toISOString();
  const todayKey     = now.split("T")[0];

  const { data: state } = await supabase
    .from("user_ad_watch_state").select("*").eq("user_id", user.id).maybeSingle();
  const isToday = state && String(state.last_reset).split("T")[0] === todayKey;
  const currentWatched = isToday ? Number(state!.ads_watched ?? 0) : 0;

  if (currentWatched >= maxAds) {
    return NextResponse.json({ error: "Daily ad limit reached" }, { status: 400 });
  }

  const newAdsCount = currentWatched + 1;
  await supabase.from("user_ad_watch_state").upsert({
    user_id: user.id, ads_watched: newAdsCount, last_reset: todayKey, last_ad_at: now,
  }, { onConflict: "user_id" });

  const { data: wallet } = await supabase
    .from("wallets").select("*").eq("user_id", user.id).maybeSingle();

  let newBalance = 0;
  if (wallet) {
    const newWallet = {
      balance:         Math.round((Number(wallet.balance)      + reward) * 1e8) / 1e8,
      total_earned:    Math.round((Number(wallet.total_earned) + reward) * 1e8) / 1e8,
      total_withdrawn: Number(wallet.total_withdrawn || 0),
      coins:           Number(wallet.coins || 0),
      updated_at:      now,
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet).catch(() => {});
    newBalance = newWallet.balance;
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "earning", amount: reward,
    status: "completed", source: `watch_ad:${token.slice(0, 8)}`, created_at: now,
  });

  return NextResponse.json({
    success: true, reward, newBalance,
    adsWatched: newAdsCount, maxAds,
    remaining: Math.max(0, maxAds - newAdsCount),
    cooldownDuration: cooldownSecs,
  });
}
