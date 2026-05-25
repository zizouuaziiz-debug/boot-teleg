import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyWebhookSignature } from "@/lib/nowpayments";
import {
  broadcastWalletUpdate,
  broadcastTransactionNew,
  broadcastTransactionUpdate,
  broadcastDepositConfirmed,
} from "@/lib/realtime-broadcast";

const CONFIRMED = new Set(["confirmed", "finished", "partially_paid"]);
const FAILED    = new Set(["failed", "expired", "refunded"]);

type Tx = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  type?: string;
};

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // ── 2. Verify HMAC signature (anti-fraud) ──────────────────────────────────
  const signature = req.headers.get("x-nowpayments-sig") ?? "";
  const valid     = await verifyWebhookSignature(body, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const paymentId   = String(body.payment_id   ?? "");
  const payStatus   = String(body.payment_status ?? "");
  const orderId     = String(body.order_id      ?? "");
  const actuallyPaid = Number(body.actually_paid ?? 0);

  if (!paymentId) return NextResponse.json({ ok: true });

  // ── 3. Idempotency check — reject duplicate events ─────────────────────────
  const eventKey = `nowpayments:${paymentId}:${payStatus}`;

  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await supabase.from("webhook_events").upsert({
    event_key:  eventKey,
    payload:    body,
    created_at: new Date().toISOString(),
  }, { onConflict: "event_key" });

  // ── 4. Payout webhook (withdrawal status) ─────────────────────────────────
  if (body.withdrawal_id) {
    const withdrawalIpnId = String(body.withdrawal_id ?? "");

    if (withdrawalIpnId.startsWith("payout_")) {
      const txId    = withdrawalIpnId.replace("payout_", "");
      const wStatus = String(body.status ?? "");

      const newStatus =
        wStatus === "COMPLETED" ? "approved" :
        wStatus === "FAILED"    ? "rejected" : null;

      if (newStatus) {
        const { data: wTx } = await supabase
          .from("transactions")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", txId)
          .select("user_id, amount")
          .maybeSingle();

        if (wTx) {
          await broadcastTransactionUpdate(wTx.user_id, txId, newStatus);

          if (newStatus === "rejected") {
            await refundBalance(supabase, wTx.user_id, Math.abs(Number(wTx.amount)));
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── 5. Deposit webhook — resolve transaction ───────────────────────────────
  let tx: Tx | null = null;

  const { data: txBySource } = await supabase
    .from("transactions")
    .select("id, user_id, amount, status, type")
    .eq("source", `nowpayments:${paymentId}`)
    .eq("type", "deposit")
    .maybeSingle();

  if (txBySource) {
    tx = txBySource as Tx;
  } else if (orderId.startsWith("dep_")) {
    const userId = orderId.split("_")[1];
    if (userId) {
      const { data: txByOrder } = await supabase
        .from("transactions")
        .select("id, user_id, amount, status, type")
        .eq("user_id", userId)
        .eq("type", "deposit")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (txByOrder) tx = txByOrder as Tx;
    }
  }

  if (!tx) return NextResponse.json({ ok: true });
  if (tx.status !== "pending") return NextResponse.json({ ok: true });

  // ── 6. Handle confirmed payment ────────────────────────────────────────────
  if (CONFIRMED.has(payStatus)) {
    const credit = actuallyPaid > 0 ? actuallyPaid : Number(tx.amount);

    await supabase.from("transactions").update({
      status:     "completed",
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, total_earned, total_withdrawn, coins")
      .eq("user_id", tx.user_id)
      .maybeSingle();

    if (wallet) {
      const newWallet = {
        balance:         Number(wallet.balance) + credit,
        total_earned:    Number(wallet.total_earned) + credit,
        total_withdrawn: Number(wallet.total_withdrawn),
        coins:           Number(wallet.coins),
        updated_at:      new Date().toISOString(),
      };

      await supabase.from("wallets").update(newWallet).eq("user_id", tx.user_id);

      // Broadcast all events in parallel
      await Promise.all([
        broadcastWalletUpdate(tx.user_id, newWallet),
        broadcastDepositConfirmed(tx.user_id, credit),
        broadcastTransactionUpdate(tx.user_id, tx.id, "completed"),
        broadcastTransactionNew(tx.user_id, {
          id:         tx.id,
          type:       "deposit",
          amount:     credit,
          status:     "completed",
          created_at: new Date().toISOString(),
        }),
      ]);
    }

  // ── 7. Handle failed payment ───────────────────────────────────────────────
  } else if (FAILED.has(payStatus)) {
    await supabase.from("transactions").update({
      status:     "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    await broadcastTransactionUpdate(tx.user_id, tx.id, "failed");
  }

  return NextResponse.json({ ok: true });
}

async function refundBalance(supabase: any, userId: string, amount: number) {
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, total_earned, total_withdrawn, coins")
    .eq("user_id", userId)
    .maybeSingle();

  if (!wallet) return;

  const newWallet = {
    balance:         Number(wallet.balance) + amount,
    total_withdrawn: Math.max(0, Number(wallet.total_withdrawn) - amount),
    total_earned:    Number(wallet.total_earned),
    coins:           Number(wallet.coins),
    updated_at:      new Date().toISOString(),
  };

  await supabase.from("wallets").update(newWallet).eq("user_id", userId);
  await broadcastWalletUpdate(userId, newWallet);
}
