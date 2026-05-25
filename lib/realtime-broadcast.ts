/**
 * Server-side Supabase Realtime broadcast helper.
 * Uses the Supabase REST Broadcast API — no persistent WebSocket on the server.
 * Failures are silently swallowed — realtime is best-effort.
 */

export interface WalletPayload {
  balance:         number;
  total_earned:    number;
  total_withdrawn: number;
  coins:           number;
}

export interface TransactionPayload {
  id:         string;
  type:       string;
  amount:     number;
  status:     string;
  created_at: string;
  source?:    string;
  address?:   string;
}

// ── Core broadcast helper ──────────────────────────────────────────────────

async function broadcast(messages: { topic: string; event: string; payload: unknown }[]) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${key}`,
        "apikey":        key,
      },
      body: JSON.stringify({ messages }),
    }).catch(() => {});
  } catch {
    // Non-fatal
  }
}

// ── Wallet events ──────────────────────────────────────────────────────────

export async function broadcastWalletUpdate(userId: string, wallet: WalletPayload): Promise<void> {
  await broadcast([{
    topic:   `wallet:${userId}`,
    event:   "wallet_update",
    payload: wallet,
  }]);
}

// ── Transaction events ─────────────────────────────────────────────────────

export async function broadcastTransactionNew(userId: string, tx: TransactionPayload): Promise<void> {
  await broadcast([
    { topic: `wallet:${userId}`,  event: "transaction_new",    payload: tx },
    { topic: "admin:live",        event: "transaction_new",    payload: { userId, ...tx } },
  ]);
}

export async function broadcastTransactionUpdate(userId: string, txId: string, status: string): Promise<void> {
  await broadcast([
    { topic: `wallet:${userId}`,  event: "transaction_update", payload: { id: txId, status } },
    { topic: "admin:live",        event: "transaction_update", payload: { userId, id: txId, status } },
  ]);
}

// ── Deposit events ─────────────────────────────────────────────────────────

export async function broadcastDepositConfirmed(userId: string, amount: number): Promise<void> {
  await broadcast([
    { topic: `wallet:${userId}`,  event: "deposit_confirmed",  payload: { amount } },
    { topic: "admin:live",        event: "deposit_confirmed",  payload: { userId, amount } },
  ]);
}

export async function broadcastDepositPending(userId: string, amount: number, txId: string): Promise<void> {
  await broadcast([
    { topic: `wallet:${userId}`,  event: "deposit_pending",    payload: { amount, txId } },
    { topic: "admin:live",        event: "deposit_pending",    payload: { userId, amount, txId } },
  ]);
}

// ── Withdraw events ────────────────────────────────────────────────────────

export async function broadcastWithdrawPending(userId: string, amount: number, txId: string): Promise<void> {
  await broadcast([
    { topic: `wallet:${userId}`,  event: "withdraw_pending",   payload: { amount, txId } },
    { topic: "admin:live",        event: "withdraw_pending",   payload: { userId, amount, txId } },
  ]);
}

// ── Admin-only events ──────────────────────────────────────────────────────

export async function broadcastToAdmin(event: string, payload: unknown): Promise<void> {
  await broadcast([{ topic: "admin:live", event, payload }]);
}

// ── Convenience: re-fetch + broadcast ─────────────────────────────────────

export async function refreshAndBroadcastWallet(userId: string): Promise<WalletPayload | null> {
  try {
    const { getSupabaseAdmin } = await import("./supabase");
    const supabase = getSupabaseAdmin();
    const { data: w } = await supabase
      .from("wallets")
      .select("balance, total_earned, total_withdrawn, coins")
      .eq("user_id", userId)
      .maybeSingle();
    if (!w) return null;
    const payload: WalletPayload = {
      balance:         Number(w.balance),
      total_earned:    Number(w.total_earned),
      total_withdrawn: Number(w.total_withdrawn),
      coins:           Number(w.coins),
    };
    await broadcastWalletUpdate(userId, payload);
    return payload;
  } catch {
    return null;
  }
}
