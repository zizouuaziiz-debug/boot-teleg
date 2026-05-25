import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  checkEthereumDeposit,
  checkBscDeposit,
  checkTronDeposit,
  checkNowpaymentsStatus,
} from "@/lib/blockchain-verify";

const CONFIRMED = new Set(["confirmed", "finished", "partially_paid"]);
const FAILED    = new Set(["failed", "expired", "refunded"]);

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { transaction_id } = body as { transaction_id?: string };

  const { data: user } = await supabase
    .from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", "deposit")
    .eq("status", "pending");

  if (transaction_id) {
    query = query.eq("id", transaction_id);
  } else {
    query = query.order("created_at", { ascending: false }).limit(5);
  }

  const { data: txs } = await query;
  if (!txs || txs.length === 0) {
    return NextResponse.json({ status: "no_pending", message: "No pending deposits found" });
  }

  let anyCompleted = false;

  for (const tx of txs) {
    const source  = tx.source as string ?? "";
    const address = tx.address as string ?? "";
    const amount  = Number(tx.amount);
    const after   = new Date(tx.created_at as string).getTime() - 60_000;

    // ── NowPayments auto-check ──────────────────────────────────────────────
    if (source.startsWith("nowpayments:")) {
      const paymentId = source.replace("nowpayments:", "");
      const result    = await checkNowpaymentsStatus(paymentId);
      if (result) {
        if (CONFIRMED.has(result.status)) {
          const credit = result.actually_paid > 0 ? result.actually_paid : amount;
          await creditDeposit(supabase, tx.id, tx.user_id, credit);
          anyCompleted = true;
          continue;
        }
        if (FAILED.has(result.status)) {
          await supabase.from("transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
          continue;
        }
      }
    }

    // ── Blockchain direct check (when NowPayments not configured) ──────────
    if (!source.startsWith("nowpayments:") && address) {
      let found = null;

      if (source === "eth") {
        found = await checkEthereumDeposit(address, amount * 0.95, after);
      } else if (source === "bsc") {
        found = await checkBscDeposit(address, amount * 0.95, after);
      } else if (source === "tron") {
        found = await checkTronDeposit(address, amount * 0.95, after);
      }

      if (found) {
        await creditDeposit(supabase, tx.id, tx.user_id, found.value);
        anyCompleted = true;
      }
    }
  }

  if (transaction_id) {
    const { data: updated } = await supabase
      .from("transactions").select("status").eq("id", transaction_id).maybeSingle();
    return NextResponse.json({ status: updated?.status ?? "pending" });
  }

  return NextResponse.json({
    status:  anyCompleted ? "completed" : "pending",
    checked: txs.length,
  });
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token !== process.env.CRON_SECRET && token !== process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pendingTxs } = await supabase
    .from("transactions")
    .select("*")
    .eq("type", "deposit")
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!pendingTxs || pendingTxs.length === 0) {
    return NextResponse.json({ processed: 0, completed: 0 });
  }

  let completed = 0;

  for (const tx of pendingTxs) {
    const source  = tx.source as string ?? "";
    const address = tx.address as string ?? "";
    const amount  = Number(tx.amount);
    const after   = new Date(tx.created_at as string).getTime() - 60_000;

    if (source.startsWith("nowpayments:")) {
      const paymentId = source.replace("nowpayments:", "");
      const result    = await checkNowpaymentsStatus(paymentId);
      if (result && CONFIRMED.has(result.status)) {
        const credit = result.actually_paid > 0 ? result.actually_paid : amount;
        await creditDeposit(supabase, tx.id, tx.user_id, credit);
        completed++;
      } else if (result && FAILED.has(result.status)) {
        await supabase.from("transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
      }
      continue;
    }

    if (address) {
      let found = null;
      if (source === "eth") found = await checkEthereumDeposit(address, amount * 0.95, after);
      else if (source === "bsc") found = await checkBscDeposit(address, amount * 0.95, after);
      else if (source === "tron") found = await checkTronDeposit(address, amount * 0.95, after);

      if (found) { await creditDeposit(supabase, tx.id, tx.user_id, found.value); completed++; }
    }
  }

  return NextResponse.json({ processed: pendingTxs.length, completed });
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

async function creditDeposit(supabase: Supabase, txId: string, userId: string, credit: number) {
  await supabase.from("transactions").update({
    status: "completed", updated_at: new Date().toISOString(),
  }).eq("id", txId);

  const { data: wallet } = await supabase
    .from("wallets").select("balance, total_earned")
    .eq("user_id", userId).maybeSingle();

  if (wallet) {
    await supabase.from("wallets").update({
      balance:      Number(wallet.balance) + credit,
      total_earned: Number(wallet.total_earned) + credit,
      updated_at:   new Date().toISOString(),
    }).eq("user_id", userId);
  }
}
