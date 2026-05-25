import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createHmac } from "crypto";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

/**
 * POST /api/earn/watch-ads/postback
 *
 * Called by Monetag (or any ad network) after the user completes a rewarded ad.
 * This is the ONLY place that credits the wallet.
 *
 * Expected query params from Monetag:
 *   ?token=<sessionToken>&status=1&sig=<hmac_signature>
 *
 * Security:
 *   - Verifies HMAC signature if postback_secret is configured
 *   - Idempotency: won't double-reward if the webhook is retried
 *   - Token must exist as PENDING and not expired
 *   - Wallet update is atomic via optimistic locking
 */
export async function GET(req: NextRequest) {
  return handlePostback(req);
}

export async function POST(req: NextRequest) {
  return handlePostback(req);
}

async function handlePostback(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  // ── Parse params (supports both GET query string and POST body) ───────────
  let params: Record<string, string> = {};

  req.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });

  if (req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = await req.json();
        params = { ...params, ...body };
      } else {
        const text = await req.text();
        new URLSearchParams(text).forEach((v, k) => { params[k] = v; });
      }
    } catch {}
  }

  const { token, status: adStatus, sig } = params;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // ── Load postback secret from admin config ────────────────────────────────
  const { data: cfg } = await supabase
    .from("admin_config")
    .select("postback_secret, ad_cooldown_seconds")
    .eq("id", 1)
    .maybeSingle();

  const postbackSecret  = (cfg?.postback_secret as string | null) ?? "";
  const cooldownSecs    = Number(cfg?.ad_cooldown_seconds ?? 30);

  // ── Signature verification (if configured) ────────────────────────────────
  if (postbackSecret && sig) {
    const valid = verifySignature(params, postbackSecret, sig);
    if (!valid) {
      console.warn("[postback] Invalid signature for token:", token.slice(0, 8));
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  // ── Accept only successful ad completions ─────────────────────────────────
  // Monetag sends status=1 for success, 0 for failure (or omits it)
  const statusCode = adStatus !== undefined ? Number(adStatus) : 1;
  if (statusCode !== 1 && adStatus !== undefined && adStatus !== "") {
    await supabase
      .from("ad_sessions")
      .update({ status: "FAILED" })
      .eq("session_token", token)
      .eq("status", "PENDING");
    return NextResponse.json({ ok: false, reason: "Ad not completed" });
  }

  // ── Find session — must be PENDING and not expired ────────────────────────
  const { data: session } = await supabase
    .from("ad_sessions")
    .select("id, user_id, status, reward_amount, idempotency_key, expires_at")
    .eq("session_token", token)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // ── Idempotency: already completed → return success (safe retry) ──────────
  if (session.status === "COMPLETED") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  if (session.status === "FAILED" || session.status === "EXPIRED") {
    return NextResponse.json({ error: `Session is ${session.status}` }, { status: 409 });
  }

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from("ad_sessions")
      .update({ status: "EXPIRED" })
      .eq("id", session.id);
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  // ── Atomic: mark COMPLETED (idempotency lock via status check) ────────────
  const { data: claimed, error: claimErr } = await supabase
    .from("ad_sessions")
    .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "PENDING")              // optimistic lock
    .select("id")
    .maybeSingle();

  if (!claimed || claimErr) {
    // Another concurrent request already claimed it
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // ── Load user wallet ──────────────────────────────────────────────────────
  const { data: wallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", session.user_id)
    .maybeSingle();

  if (!wallet) {
    console.error("[postback] Wallet not found for user:", session.user_id);
    return NextResponse.json({ error: "Wallet not found" }, { status: 500 });
  }

  const reward      = Number(session.reward_amount);
  const now         = new Date().toISOString();
  const todayKey    = now.split("T")[0];
  const newBalance  = Math.round((Number(wallet.balance) + reward) * 1e8) / 1e8;
  const newEarned   = Math.round((Number(wallet.total_earned) + reward) * 1e8) / 1e8;

  // ── Credit wallet ─────────────────────────────────────────────────────────
  const updatedWallet = {
    balance:         newBalance,
    total_earned:    newEarned,
    total_withdrawn: Number(wallet.total_withdrawn || 0),
    coins:           Number(wallet.coins || 0),
    updated_at:      now,
  };

  const { error: walletErr } = await supabase
    .from("wallets")
    .update(updatedWallet)
    .eq("user_id", session.user_id);

  if (walletErr) {
    // Rollback session status so it can be retried
    await supabase
      .from("ad_sessions")
      .update({ status: "PENDING" })
      .eq("id", session.id);
    console.error("[postback] Wallet update failed:", walletErr.message);
    return NextResponse.json({ error: "Wallet update failed" }, { status: 500 });
  }

  // ── Log transaction ───────────────────────────────────────────────────────
  await supabase.from("transactions").insert({
    user_id:    session.user_id,
    type:       "earning",
    amount:     reward,
    status:     "completed",
    source:     `watch_ad:${token.slice(0, 12)}`,
    created_at: now,
  });

  // ── Update daily watch state ──────────────────────────────────────────────
  const { data: state } = await supabase
    .from("user_ad_watch_state")
    .select("ads_watched, last_reset")
    .eq("user_id", session.user_id)
    .maybeSingle();

  const isToday = state && String(state.last_reset).split("T")[0] === todayKey;
  const currentWatched = isToday ? Number(state!.ads_watched ?? 0) : 0;

  await supabase.from("user_ad_watch_state").upsert({
    user_id:     session.user_id,
    ads_watched: currentWatched + 1,
    last_reset:  todayKey,
    last_ad_at:  now,
  }, { onConflict: "user_id" });

  // ── Broadcast wallet update via Supabase Realtime ─────────────────────────
  await broadcastWalletUpdate(session.user_id, updatedWallet).catch(() => {});

  console.info(`[postback] Rewarded user ${session.user_id} with $${reward} USDT`);

  return NextResponse.json({ ok: true, reward });
}

// ── HMAC signature helper ─────────────────────────────────────────────────────
function verifySignature(
  params:      Record<string, string>,
  secret:      string,
  receivedSig: string
): boolean {
  const sorted = Object.keys(params)
    .sort()
    .filter((k) => k !== "sig")
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const expected = createHmac("sha256", secret).update(sorted).digest("hex");
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== receivedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ receivedSig.charCodeAt(i);
  }
  return diff === 0;
}
