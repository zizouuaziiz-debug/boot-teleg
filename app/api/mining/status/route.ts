import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import { DEFAULT_MINING_RATES } from "@/lib/mining-config";

export async function GET(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id, vip_level").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: wallet } = await supabase
    .from("wallets").select("balance, total_earned").eq("user_id", user.id).maybeSingle();

  // ── Load rates ────────────────────────────────────────────────────────────
  const { data: adminCfg } = await supabase
    .from("admin_config").select("mining_config").eq("id", 1).maybeSingle();
  const rates: Record<string, typeof DEFAULT_MINING_RATES[keyof typeof DEFAULT_MINING_RATES]> =
    (adminCfg?.mining_config && Object.keys(adminCfg.mining_config).length > 0)
      ? adminCfg.mining_config : DEFAULT_MINING_RATES;

  // ── Fetch active session ───────────────────────────────────────────────────
  const { data: dbSession } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── BUG FIX: Auto-complete expired ACTIVE sessions ────────────────────────
  // If a session has been active longer than its duration, finalize it now
  // so it can never stay stuck as ACTIVE after completion.
  if (dbSession) {
    const planId        = dbSession.plan_id ?? "basic";
    const config        = rates[planId] ?? DEFAULT_MINING_RATES.basic;
    const durationMs    = (dbSession.duration_hours ?? config.duration_hours) * 3_600_000;
    const startedMs     = new Date(dbSession.started_at).getTime();
    const elapsedMs     = Date.now() - startedMs;

    if (elapsedMs >= durationMs) {
      // Session is fully complete — finalize it atomically
      const elapsedH       = (dbSession.duration_hours ?? config.duration_hours);
      const dailyRate      = Number(dbSession.rate ?? config.daily_rate);
      const balanceAtStart = Number(dbSession.balance_at_start ?? 0);
      const earned         = Math.round(
        (balanceAtStart > 0
          ? balanceAtStart * dailyRate * (elapsedH / 24)
          : dailyRate * (elapsedH / 24)
        ) * 1e8
      ) / 1e8;

      const { data: finalized } = await supabase
        .from("mining_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString(), earned })
        .eq("id", dbSession.id)
        .eq("status", "active")   // optimistic lock — prevents race conditions
        .select("id")
        .maybeSingle();

      // Only credit wallet if WE won the race (finalized is not null)
      if (finalized && wallet) {
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
          status: "completed", source: `mining:${planId}`,
        });
        await broadcastWalletUpdate(user.id, newWallet).catch(() => {});

        // Re-fetch wallet after update
        const { data: freshWallet } = await supabase
          .from("wallets").select("balance, total_earned").eq("user_id", user.id).maybeSingle();

        const history = await fetchHistory(supabase, user.id);
        return NextResponse.json({
          session:      null,           // no more active session
          vip_level:    user.vip_level ?? 0,
          balance:      Number(freshWallet?.balance      ?? 0),
          total_earned: Number(freshWallet?.total_earned ?? 0),
          rates,
          history,
          autoCompleted: true,
          lastEarned:    earned,
        });
      }

      // If finalized is null, another request already completed it — return no session
      const history = await fetchHistory(supabase, user.id);
      return NextResponse.json({
        session:      null,
        vip_level:    user.vip_level ?? 0,
        balance:      Number(wallet?.balance      ?? 0),
        total_earned: Number(wallet?.total_earned ?? 0),
        rates,
        history,
      });
    }
  }

  // ── Build session shape for frontend (not yet expired) ────────────────────
  let session = null;
  if (dbSession) {
    const planId = dbSession.plan_id ?? (
      user.vip_level === 0 ? "basic" : user.vip_level === 1 ? "silver" :
      user.vip_level === 2 ? "gold"  : user.vip_level === 3 ? "diamond" : "ultimate"
    );
    const rate   = rates[planId] ?? DEFAULT_MINING_RATES.basic;
    const startMs = new Date(dbSession.started_at).getTime();
    const endMs   = startMs + (dbSession.duration_hours ?? rate.duration_hours) * 3_600_000;

    session = {
      plan_id:          planId,
      plan_name:        rate.name,
      start_time:       startMs,
      end_time:         endMs,
      daily_rate:       dbSession.rate      ?? rate.daily_rate,
      balance_at_start: Number(dbSession.balance_at_start ?? wallet?.balance ?? 0),
      duration_hours:   dbSession.duration_hours ?? rate.duration_hours,
    };
  }

  const history = await fetchHistory(supabase, user.id);

  return NextResponse.json({
    session,
    vip_level:    user.vip_level ?? 0,
    balance:      Number(wallet?.balance      ?? 0),
    total_earned: Number(wallet?.total_earned ?? 0),
    rates,
    history,
  });
}

async function fetchHistory(
  supabase: ReturnType<typeof import("@/lib/supabase")["getSupabaseAdmin"]>,
  userId: string
) {
  const { data } = await supabase
    .from("transactions")
    .select("id, amount, source, created_at")
    .eq("user_id", userId)
    .like("source", "mining:%")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => ({
    id:         r.id,
    amount:     Number(r.amount),
    source:     r.source ?? "mining:basic",
    created_at: r.created_at,
  }));
}
