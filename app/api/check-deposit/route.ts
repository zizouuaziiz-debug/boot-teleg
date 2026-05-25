import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import {
  checkEthereumDeposit,
  checkBscDeposit,
  checkTronDeposit,
} from "@/lib/blockchain-verify";

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body    = await req.json().catch(() => ({}));
  const address = body.address as string | undefined;
  const network = (body.network as string | undefined) ?? "tron";

  const { data: user } = await supabase
    .from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: pendingTxs } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", "deposit")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!pendingTxs || pendingTxs.length === 0) {
    return NextResponse.json({
      success: true,
      status:  "no_pending",
      message: "No pending deposit found.",
    });
  }

  const tx    = pendingTxs[0];
  const after = new Date(tx.created_at as string).getTime() - 60_000;
  const amt   = Number(tx.amount);
  const addr  = (tx.address as string | null) ?? address ?? "";

  let found = null;
  if (addr) {
    if (network === "eth" || tx.source === "eth") {
      found = await checkEthereumDeposit(addr, amt * 0.95, after);
    } else if (network === "bsc" || tx.source === "bsc") {
      found = await checkBscDeposit(addr, amt * 0.95, after);
    } else {
      found = await checkTronDeposit(addr, amt * 0.95, after);
    }
  }

  if (found) {
    const credit = found.value;

    await supabase.from("transactions").update({
      status:     "completed",
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    const { data: wallet } = await supabase
      .from("wallets").select("balance, total_earned, total_withdrawn, coins")
      .eq("user_id", user.id).maybeSingle();

    if (wallet) {
      const newWallet = {
        balance:         Number(wallet.balance) + credit,
        total_earned:    Number(wallet.total_earned) + credit,
        total_withdrawn: Number(wallet.total_withdrawn),
        coins:           Number(wallet.coins),
        updated_at:      new Date().toISOString(),
      };
      await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
      await broadcastWalletUpdate(user.id, newWallet);
    }

    return NextResponse.json({
      success: true,
      status:  "completed",
      message: `Deposit of $${credit.toFixed(2)} USDT confirmed on blockchain and credited to your account!`,
      tx_hash: found.hash,
      credit,
    });
  }

  return NextResponse.json({
    success: true,
    status:  "pending",
    message: "Deposit not yet detected on blockchain. Please wait for confirmations (1-30 min).",
    address: addr || null,
  });
}
