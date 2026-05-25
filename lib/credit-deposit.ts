import { broadcastWalletUpdate, broadcastTransactionUpdate } from "@/lib/realtime-broadcast"

type Supabase = any

export async function creditDeposit(
  supabase: Supabase,
  txId: string,
  userId: string,
  credit: number
) {
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, total_earned, total_withdrawn, coins")
    .eq("user_id", userId)
    .maybeSingle()

  if (!wallet) return

  const newWallet = {
    balance:         Number(wallet.balance) + Number(credit),
    total_earned:    Number(wallet.total_earned) + Number(credit),
    total_withdrawn: Number(wallet.total_withdrawn ?? 0),
    coins:           Number(wallet.coins ?? 0),
    updated_at:      new Date().toISOString(),
  }

  await supabase.from("wallets").update(newWallet).eq("user_id", userId)

  await supabase.from("transactions").update({
    status:     "completed",
    updated_at: new Date().toISOString(),
  }).eq("id", txId)

  await broadcastWalletUpdate(userId, newWallet)
  await broadcastTransactionUpdate(userId, txId, "completed")
}
