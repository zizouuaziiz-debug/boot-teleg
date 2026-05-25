import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import { DEFAULT_MINING_RATES } from "@/lib/mining-config";

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id, vip_level, status").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.status === "banned" || user.status === "suspended")
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });

  const { data: session } = await supabase
    .from("mining_sessions").select("*")
    .eq("user_id", user.id).eq("status", "active")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();

  if (!session) return NextResponse.json({ error: "No active mining session" }, { status: 400 });

  const { data: adminCfg } = await supabase
    .from("admin_config").select("mining_config").eq("id", 1).maybeSingle();
  const rates = (adminCfg?.mining_config && Object.keys(adminCfg.mining_config).length > 0)
    ? adminCfg.mining_config as typeof DEFAULT_MINING_RATES
    : DEFAULT_MINING_RATES;

  const planId = session.plan_id ?? (
    user.vip_level === 0 ? "basic" : user.vip_level === 1 ? "silver" :
    user.vip_level === 2 ? "gold"  : user.vip_level === 3 ? "diamond" : "ultimate"
  );
  const config = rates[planId as keyof typeof rates] ?? DEFAULT_MINING_RATES.basic;

  const durationMs   = (session.duration_hours ?? config.duration_hours) * 3_600_000;
  const elapsedMs    = Date.now() - new Date(session.started_at).getTime();

  // BUG FIX: allow claim when 90% elapsed OR fully elapsed (100%)
  // Previously: elapsedMs < durationMs * 0.9 blocked expired sessions
  const minElapsedMs = durationMs * 0.9;
  if (elapsedMs < minElapsedMs) {
    const remainingMin = Math.ceil((minElapsedMs - elapsedMs) / 60000);
    return NextResponse.json({
      error: `Mining not complete. ${remainingMin} minutes remaining.`
    }, { status: 400 });
  }

  // Cap elapsed at exactly duration_hours to avoid over-rewarding
  const elapsedH       = Math.min(elapsedMs / 3_600_000, session.duration_hours ?? config.duration_hours);
  const dailyRate      = Number(session.rate ?? config.daily_rate);
  const balanceAtStart = Number(session.balance_at_start ?? 0);
  const earned         = Math.round(
    (balanceAtStart > 0
      ? balanceAtStart * dailyRate * (elapsedH / 24)
      : dailyRate * (elapsedH / 24)
    ) * 1e8
  ) / 1e8;

  // ── Atomic claim via optimistic lock ─────────────────────────────────────
  const { data: claimedSession } = await supabase
    .from("mining_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString(), earned })
    .eq("id", session.id)
    .eq("status", "active")   // prevents double-claim
    .select()
    .maybeSingle();

  if (!claimedSession) {
    // Idempotency: already claimed (e.g. auto-complete in status route raced us)
    const { data: done } = await supabase
      .from("mining_sessions")
      .select("earned").eq("id", session.id).maybeSingle();
    return NextResponse.json({ success: true, earned: Number(done?.earned ?? earned), idempotent: true });
  }

  // ── Credit wallet ─────────────────────────────────────────────────────────
  const { data: wallet } = await supabase
    .from("wallets").select("balance, total_earned, total_withdrawn, coins")
    .eq("user_id", user.id).maybeSingle();

  if (wallet) {
    const newWallet = {
      balance:         Number(wallet.balance)         + earned,
      total_earned:    Number(wallet.total_earned)    + earned,
      total_withdrawn: Number(wallet.total_withdrawn),
      coins:           Number(wallet.coins),
      updated_at:      new Date().toISOString(),
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "mining", amount: earned,
    status: "completed", source: `mining:${planId}`,
  });

  return NextResponse.json({ success: true, earned });
}
