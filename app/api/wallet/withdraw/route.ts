import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate, broadcastTransactionNew, broadcastWithdrawPending } from "@/lib/realtime-broadcast";

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { amount, address } = body as { amount?: string | number; address?: string };

  if (!amount) return NextResponse.json({ error: "Amount is required" }, { status: 400 });
  if (!address?.trim()) return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });

  const numAmount = parseFloat(String(amount));
  if (isNaN(numAmount) || numAmount <= 0)
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  if (numAmount > 10000)
    return NextResponse.json({ error: "Maximum withdrawal is $10,000" }, { status: 400 });

  const { data: adminConfig } = await supabase.from("admin_config")
    .select("min_withdrawal").eq("id", 1).maybeSingle();
  const minWithdrawal = Number(adminConfig?.min_withdrawal ?? 5);

  if (numAmount < minWithdrawal)
    return NextResponse.json({ error: `Minimum withdrawal is $${minWithdrawal}` }, { status: 400 });

  const { data: user } = await supabase.from("users")
    .select("id, status").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.status === "banned" || user.status === "suspended")
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });

  const { data: wallet } = await supabase.from("wallets")
    .select("balance, total_withdrawn, total_earned, coins")
    .eq("user_id", user.id).maybeSingle();

  if (!wallet || Number(wallet.balance) < numAmount)
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });

  const newBalance        = Math.round((Number(wallet.balance) - numAmount) * 1e8) / 1e8;
  const newTotalWithdrawn = Math.round((Number(wallet.total_withdrawn) + numAmount) * 1e8) / 1e8;

  const newWallet = {
    balance:         newBalance,
    total_withdrawn: newTotalWithdrawn,
    total_earned:    Number(wallet.total_earned),
    coins:           Number(wallet.coins),
    updated_at:      new Date().toISOString(),
  };

  // Atomic deduction — optimistic lock prevents double-spend
  const { data: updatedWallet } = await supabase
    .from("wallets")
    .update(newWallet)
    .eq("user_id", user.id)
    .gte("balance", numAmount)
    .select()
    .maybeSingle();

  if (!updatedWallet) {
    return NextResponse.json({ error: "Insufficient balance (concurrent request)" }, { status: 400 });
  }

  const { data: tx } = await supabase.from("transactions").insert({
    user_id: user.id,
    type:    "withdrawal",
    amount:  -numAmount,
    status:  "pending",
    address: address.trim(),
  }).select().single();

  // Broadcast all events in parallel
  await Promise.all([
    broadcastWalletUpdate(user.id, newWallet),
    broadcastTransactionNew(user.id, {
      id:         tx?.id ?? `wdraw_${Date.now()}`,
      type:       "withdrawal",
      amount:     -numAmount,
      status:     "pending",
      created_at: new Date().toISOString(),
      address:    address.trim(),
    }),
    broadcastWithdrawPending(user.id, numAmount, tx?.id ?? ""),
  ]);

  return NextResponse.json({ success: true, transaction: tx });
}
