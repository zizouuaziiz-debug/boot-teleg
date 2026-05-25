import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import { DEFAULT_MINING_RATES } from "@/lib/mining-config";

/**
 * GET /api/mining/reconcile
 *
 * Safety reconciliation job — finds ALL stuck ACTIVE mining sessions
 * whose duration has elapsed and completes them, crediting wallets.
 *
 * Call this via:
 *   - A cron job / Vercel cron (every 30 minutes)
 *   - A Supabase Edge Function scheduled trigger
 *   - Manually from admin panel
 *
 * Secured by RECONCILE_SECRET env var. Set it in your .env:
 *   RECONCILE_SECRET=your-strong-secret
 */
export async function GET(req: NextRequest) {
  const secret = process.env.RECONCILE_SECRET;
  if (secret) {
    const auth = req.headers.get("x-reconcile-secret") ?? req.nextUrl.searchParams.get("secret");
    if (auth !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: adminCfg } = await supabase
    .from("admin_config").select("mining_config").eq("id", 1).maybeSingle();
  const rates =
    (adminCfg?.mining_config && Object.keys(adminCfg.mining_config).length > 0)
      ? adminCfg.mining_config : DEFAULT_MINING_RATES;

  // Fetch all active sessions ordered by oldest first
  const { data: activeSessions } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("status", "active")
    .order("started_at", { ascending: true });

  if (!activeSessions?.length) {
    return NextResponse.json({ fixed: 0, message: "No stuck sessions found" });
  }

  let fixed = 0;
  let skipped = 0;
  const results: { sessionId: string; userId: string; earned: number; status: string }[] = [];

  for (const session of activeSessions) {
    const planId     = session.plan_id ?? "basic";
    const config     = (rates as any)[planId] ?? DEFAULT_MINING_RATES.basic;
    const durationMs = (session.duration_hours ?? config.duration_hours) * 3_600_000;
    const elapsedMs  = Date.now() - new Date(session.started_at).getTime();

    if (elapsedMs < durationMs) {
      skipped++;
      continue; // still running — skip
    }

    // Expired — complete it
    const elapsedH       = session.duration_hours ?? config.duration_hours;
    const dailyRate      = Number(session.rate ?? config.daily_rate);
    const balanceAtStart = Number(session.balance_at_start ?? 0);
    const earned         = Math.round(
      (balanceAtStart > 0
        ? balanceAtStart * dailyRate * (elapsedH / 24)
        : dailyRate * (elapsedH / 24)
      ) * 1e8
    ) / 1e8;

    const { data: finalized } = await supabase
      .from("mining_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString(), earned })
      .eq("id", session.id)
      .eq("status", "active")   // optimistic lock
      .select("id")
      .maybeSingle();

    if (!finalized) {
      // Another process already completed it
      results.push({ sessionId: session.id, userId: session.user_id, earned: 0, status: "already_completed" });
      continue;
    }

    // Credit wallet if earned > 0
    if (earned > 0) {
      const { data: wallet } = await supabase
        .from("wallets").select("*").eq("user_id", session.user_id).maybeSingle();

      if (wallet) {
        const newWallet = {
          balance:         Number(wallet.balance)         + earned,
          total_earned:    Number(wallet.total_earned)    + earned,
          total_withdrawn: Number((wallet as any).total_withdrawn ?? 0),
          coins:           Number((wallet as any).coins ?? 0),
          updated_at:      new Date().toISOString(),
        };
        await supabase.from("wallets").update(newWallet).eq("user_id", session.user_id);
        await supabase.from("transactions").insert({
          user_id: session.user_id, type: "mining", amount: earned,
          status: "completed", source: `mining:${planId}`,
        });
        await broadcastWalletUpdate(session.user_id, newWallet).catch(() => {});
      }
    }

    fixed++;
    results.push({ sessionId: session.id, userId: session.user_id, earned, status: "completed" });
  }

  console.info(`[mining/reconcile] Fixed ${fixed} stuck sessions, skipped ${skipped} active ones`);

  return NextResponse.json({
    fixed,
    skipped,
    total: activeSessions.length,
    results,
  });
}

// Also support POST for cron services that use POST
export { GET as POST };
