/**
 * SSE fallback endpoint for wallet real-time updates.
 * Primary: Supabase Realtime (via use-realtime-wallet / use-realtime-transactions)
 * Fallback: This endpoint — polls wallet every 15s and streams changes as SSE.
 */
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const telegramId = req.headers.get("x-telegram-id")
    ?? req.nextUrl.searchParams.get("telegram_id");

  if (!telegramId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Resolve user
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!user) return new Response("User not found", { status: 404 });

  const userId = user.id;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // client disconnected
        }
      };

      // Send initial wallet snapshot
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance, total_earned, total_withdrawn, coins")
        .eq("user_id", userId)
        .maybeSingle();

      if (wallet) {
        send("wallet_update", {
          balance:         Number(wallet.balance),
          total_earned:    Number(wallet.total_earned),
          total_withdrawn: Number(wallet.total_withdrawn),
          coins:           Number(wallet.coins),
        });
      }

      // Send initial transactions snapshot
      const { data: txs } = await supabase
        .from("transactions")
        .select("id, type, amount, status, created_at, source, address")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (txs?.length) {
        send("transactions_snapshot", txs);
      }

      // Heartbeat every 25s to keep proxy alive
      let lastWallet = wallet ? JSON.stringify(wallet) : "";
      let interval: ReturnType<typeof setInterval>;

      interval = setInterval(async () => {
        try {
          // Heartbeat ping
          controller.enqueue(encoder.encode(`: ping\n\n`));

          // Check for wallet changes
          const { data: w } = await supabase
            .from("wallets")
            .select("balance, total_earned, total_withdrawn, coins")
            .eq("user_id", userId)
            .maybeSingle();

          if (w) {
            const wStr = JSON.stringify(w);
            if (wStr !== lastWallet) {
              lastWallet = wStr;
              send("wallet_update", {
                balance:         Number(w.balance),
                total_earned:    Number(w.total_earned),
                total_withdrawn: Number(w.total_withdrawn),
                coins:           Number(w.coins),
              });
            }
          }
        } catch {
          clearInterval(interval);
        }
      }, 25_000);

      // Clean up on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache, no-transform",
      "Connection":                  "keep-alive",
      "X-Accel-Buffering":           "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
