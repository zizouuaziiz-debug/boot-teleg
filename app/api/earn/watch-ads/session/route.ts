import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { randomBytes } from "crypto";

const DEFAULT_MAX_ADS       = 5;
const DEFAULT_COOLDOWN_SECS = 30;
const DEFAULT_REWARD        = 0.05;

const KNOWN_NETWORKS = [
  "monetag","admob","unity","applovin","ironsource",
  "facebook","vungle","chartboost","mintegral",
];

function isPerNetwork(obj: unknown): obj is Record<string, Record<string, string>> {
  return (
    !!obj && typeof obj === "object" && !Array.isArray(obj) &&
    Object.keys(obj as object).some((k) => KNOWN_NETWORKS.includes(k))
  );
}

/** Resolve the first active network + its zone config from admin_config */
function resolveNetwork(stored: unknown): {
  networkId: string;
  zoneId: string;
  config: Record<string, string>;
} | null {
  if (!stored) return null;

  if (Array.isArray(stored) && stored.length > 0) {
    const n = stored[0] as { networkId?: string; fields?: Record<string, string> };
    const networkId = n?.networkId ?? "monetag";
    const fields = n?.fields ?? {};
    const zoneId = fields.rewardedZoneId ?? fields.interstitialZoneId ?? "";
    return { networkId, zoneId, config: fields };
  }

  if (isPerNetwork(stored)) {
    // { monetag: { rewardedZoneId: "xxx" } }
    const entry = Object.entries(stored).find(([, fields]) =>
      Object.values(fields).some((v) => v && String(v).trim() !== "")
    );
    if (!entry) return null;
    const [networkId, fields] = entry;
    const zoneId = fields.rewardedZoneId ?? fields.interstitialZoneId ?? "";
    return { networkId, zoneId, config: fields };
  }

  // Legacy flat object
  const legacy = stored as Record<string, string>;
  const networkId = legacy.primary ?? legacy.networkId ?? "monetag";
  const zoneId = legacy.rewardedZoneId ?? legacy.monetagZoneId ?? legacy.interstitialZoneId ?? "";
  if (!zoneId) return null;
  return { networkId, zoneId, config: { rewardedZoneId: zoneId } };
}

/**
 * POST /api/earn/watch-ads/session
 *
 * Creates a PENDING ad session and returns session token + network config
 * so the frontend can launch the correct ad.
 */
export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Resolve user ──────────────────────────────────────────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("id, status")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.status === "banned" || user.status === "suspended") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  // ── Load admin config ─────────────────────────────────────────────────────
  const { data: cfg } = await supabase
    .from("admin_config")
    .select("max_daily_ads, ad_cooldown_seconds, reward_per_ad, ad_networks, vip_multiplier, postback_secret")
    .eq("id", 1)
    .maybeSingle();

  const maxAds       = Number(cfg?.max_daily_ads       ?? DEFAULT_MAX_ADS);
  const cooldownSecs = Number(cfg?.ad_cooldown_seconds ?? DEFAULT_COOLDOWN_SECS);
  const rewardPerAd  = Number(cfg?.reward_per_ad       ?? DEFAULT_REWARD);

  // ── Resolve active ad network ─────────────────────────────────────────────
  const network = resolveNetwork(cfg?.ad_networks);
  if (!network) {
    return NextResponse.json({ error: "No ad network configured" }, { status: 503 });
  }

  // ── Daily limit check ─────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: completedToday } = await supabase
    .from("ad_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "COMPLETED")
    .gte("created_at", todayStart.toISOString());

  if ((completedToday ?? 0) >= maxAds) {
    return NextResponse.json({
      error: "Daily ad limit reached",
      adsWatched: completedToday,
      maxAds,
    }, { status: 400 });
  }

  // ── Cooldown check ────────────────────────────────────────────────────────
  const todayKey = new Date().toISOString().split("T")[0];
  const { data: state } = await supabase
    .from("user_ad_watch_state")
    .select("last_ad_at, last_reset")
    .eq("user_id", user.id)
    .maybeSingle();

  const isToday = state && String(state.last_reset).split("T")[0] === todayKey;
  if (isToday && state.last_ad_at) {
    const elapsed = Math.floor((Date.now() - new Date(state.last_ad_at).getTime()) / 1000);
    if (elapsed < cooldownSecs) {
      return NextResponse.json({
        error: "Cooldown active",
        cooldownRemaining: cooldownSecs - elapsed,
      }, { status: 429 });
    }
  }

  // ── Expire stale PENDING sessions ─────────────────────────────────────────
  await supabase
    .from("ad_sessions")
    .update({ status: "EXPIRED" })
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .lt("expires_at", new Date().toISOString());

  // ── Create new PENDING session ────────────────────────────────────────────
  const sessionToken   = randomBytes(32).toString("hex");
  const idempotencyKey = randomBytes(16).toString("hex");
  const expiresAt      = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const ipAddress      = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;

  const { error: insertErr } = await supabase.from("ad_sessions").insert({
    user_id:         user.id,
    session_token:   sessionToken,
    network_id:      network.networkId,
    status:          "PENDING",
    reward_amount:   rewardPerAd,
    idempotency_key: idempotencyKey,
    ip_address:      ipAddress,
    expires_at:      expiresAt,
  });

  if (insertErr) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Build postback URL for Monetag
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const postbackUrl = `${proto}://${host}/api/earn/watch-ads/postback?token=${sessionToken}&status=1`;

  return NextResponse.json({
    sessionToken,
    rewardAmount: rewardPerAd,
    expiresAt,
    postbackUrl,
    network: {
      id:     network.networkId,
      name:   network.networkId.charAt(0).toUpperCase() + network.networkId.slice(1),
      config: { zoneId: network.zoneId, ...network.config },
    },
  });
}
