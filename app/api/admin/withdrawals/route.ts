import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { createPayout, isConfigured } from "@/lib/nowpayments";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

function unauthorized() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("transactions")
    .select("*, users!inner(first_name, last_name, username, telegram_id)")
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  
  const { data: withdrawals } = await query.limit(200);

  // ⭐️ تحويل البيانات لتشمل اسم المستخدم
  const formattedWithdrawals = (withdrawals ?? []).map((w: any) => ({
    id: w.id,
    userId: w.user_id,
    user: w.users?.first_name || w.users?.username || `#${w.users?.telegram_id || "Unknown"}`,
    amount: w.amount,
    address: w.address || "",
    status: w.status,
    date: new Date(w.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    processedAt: w.updated_at && w.status !== "pending" 
      ? new Date(w.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) 
      : undefined,
  }));

  return NextResponse.json({ withdrawals: formattedWithdrawals });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const id     = body.id || body.txId;
  let   status = body.status;
  if (!status && body.action) {
    status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : body.action;
  }
  const note = body.note ?? null;

  if (!id || !status) return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  if (!["approved", "rejected"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const { data: tx } = await supabase.from("transactions").select("*")
    .eq("id", id).maybeSingle();
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (tx.status !== "pending") return NextResponse.json({ error: "Already processed" }, { status: 400 });

  if (status === "approved") {
    let payoutId: string | null = null;
    let payoutError: string | null = null;

    const configured = await isConfigured();
    if (configured && tx.address) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
      try {
        const payout = await createPayout({
          address:     tx.address as string,
          amountUSDT:  Math.abs(Number(tx.amount)),
          currency:    "usdttrc20",
          callbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
          ipn_id:      `payout_${tx.id}`,
        });
        payoutId = payout.id;
      } catch (e) {
        payoutError = (e as Error)?.message ?? "Payout failed";
      }
    }

    await supabase.from("transactions").update({
      status:     "approved",
      admin_note: [note, payoutId ? `payout:${payoutId}` : null, payoutError].filter(Boolean).join(" | ") || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ success: true, payout_id: payoutId, payout_error: payoutError });
  }

  // ── Rejected → refund balance ──────────────────────────────────────────────
  const refundAmount = Math.abs(Number(tx.amount));
  const { data: wallet } = await supabase.from("wallets")
    .select("balance, total_earned, total_withdrawn, coins")
    .eq("user_id", tx.user_id).maybeSingle();

  if (wallet) {
    const newWallet = {
      balance:         Number(wallet.balance)         + refundAmount,
      total_withdrawn: Math.max(0, Number(wallet.total_withdrawn) - refundAmount),
      total_earned:    Number(wallet.total_earned),
      coins:           Number(wallet.coins),
      updated_at:      new Date().toISOString(),
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", tx.user_id);
    await broadcastWalletUpdate(tx.user_id, newWallet);
  }

  await supabase.from("transactions").update({
    status: "rejected", admin_note: note, updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ success: true });
}
