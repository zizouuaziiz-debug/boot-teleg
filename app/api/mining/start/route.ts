import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import { DEFAULT_MINING_RATES } from "@/lib/mining-config";

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => ({}));
  const planId: string = body.plan_id ?? "basic";

  const { data: user } = await supabase
    .from("users").select("id, vip_level").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // ── Load rates ────────────────────────────────────────────────────────────
  const { data: adminCfg } = await supabase
    .from("admin_config").select("mining_config").eq("id", 1).maybeSingle();
  const rates =
    (adminCfg?.mining_config && Object.keys(adminCfg.mining_config).length > 0)
      ? adminCfg.mining_config : DEFAULT_MINING_RATES;
  const config = rates[planId] ?? DEFAULT_MINING_RATES.basic;

  // ── VIP check ─────────────────────────────────────────────────────────────
  if (user.vip_level < (config.min_vip ?? 0)) {
    return NextResponse.json({ error: "Insufficient VIP level for this plan" }, { status: 400 });
  }

  // ── BUG FIX: Auto-expire/complete stuck ACTIVE sessions first ─────────────
  // A session that should have expired must NOT block new sessions.
  const { data: existingActive } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingActive) {
    const cfg           = rates[existingActive.plan_id ?? "basic"] ?? DEFAULT_MINING_RATES.basic;
    const durationMs    = (existingActive.duration_hours ?? cfg.duration_hours) * 3_600_000;
    const elapsedMs     = Date.now() - new Date(existingActive.started_at).getTime();

    if (elapsedMs >= durationMs) {
      // Expired session — auto-complete it then allow new session to start
      const elapsedH       = existingActive.duration_hours ?? cfg.duration_hours;
      const dailyRate      = Number(existingActive.rate ?? cfg.daily_rate);
      const balanceAtStart = Number(existingActive.balance_at_start ?? 0);
      const earned         = Math.round(
        (balanceAtStart > 0
          ? balanceAtStart * dailyRate * (elapsedH / 24)
          : dailyRate * (elapsedH / 24)
        ) * 1e8
      ) / 1e8;

      const { data: finalized } = await supabase
        .from("mining_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString(), earned })
        .eq("id", existingActive.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

      if (finalized && earned > 0) {
        const { data: wallet } = await supabase
          .from("wallets").select("*").eq("user_id", user.id).maybeSingle();
        if (wallet) {
          const newWallet = {
            balance:         Number(wallet.balance)         + earned,
            total_earned:    Number(wallet.total_earned)    + earned,
            total_withdrawn: Number((wallet as any).total_withdrawn ?? 0),
            coins:           Number((wallet as any).coins ?? 0),
            updated_at:      new Date().toISOString(),
          };
          await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
          await supabase.from("transactions").insert({
            user_id: user.id, type: "mining", amount: earned,
            status: "completed", source: `mining:${existingActive.plan_id ?? "basic"}`,
          });
          await broadcastWalletUpdate(user.id, newWallet).catch(() => {});
        }
      }
      // Fall through — session is now completed, allow new one
    } else {
      // Truly active, not expired — block new session
      return NextResponse.json({ error: "Mining already active" }, { status: 400 });
    }
  }

  // ── Get current wallet balance ────────────────────────────────────────────
  const { data: wallet } = await supabase
    .from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
  const balanceAtStart = Number(wallet?.balance ?? 0);

  // ── Create new session ────────────────────────────────────────────────────
  const { data: session, error } = await supabase
    .from("mining_sessions")
    .insert({
      user_id:          user.id,
      plan_id:          planId,
      status:           "active",
      started_at:       new Date().toISOString(),
      rate:             config.daily_rate,
      duration_hours:   config.duration_hours,
      balance_at_start: balanceAtStart,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, session, config });
}
