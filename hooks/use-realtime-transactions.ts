"use client";

import { useEffect, useRef, useState } from "react";

export interface LiveTransaction {
  id:         string;
  type:       string;
  amount:     number;
  status:     string;
  created_at: string;
  source?:    string;
  address?:   string;
}

interface Options {
  onNew?:    (tx: LiveTransaction) => void;
  onUpdate?: (txId: string, status: string) => void;
}

/**
 * Subscribes to Supabase Realtime broadcast channel `wallet:{userId}` for
 * transaction events. Returns the live connection status.
 *
 * Events:
 *   - transaction_new    → onNew(tx)
 *   - transaction_update → onUpdate(id, status)
 *   - deposit_confirmed  → onNew(synthetic tx)
 *   - withdraw_pending   → (status update)
 */
export function useRealtimeTransactions(
  userId:  string | null,
  options: Options
): { isLive: boolean } {
  const [isLive, setIsLive] = useState(false);
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    if (!userId) return;

    let channel:   ReturnType<ReturnType<typeof import("@supabase/supabase-js")["createClient"]>["channel"]> | null = null;
    let supabase:  Awaited<ReturnType<typeof import("../lib/supabase-browser")["getSupabaseBrowser"]>> | null = null;
    let cancelled  = false;

    (async () => {
      try {
        const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
        if (cancelled) return;

        supabase = getSupabaseBrowser();
        channel  = supabase
          .channel(`wallet:${userId}`)
          .on("broadcast", { event: "transaction_new" }, ({ payload }) => {
            if (payload?.id) optsRef.current.onNew?.(payload as LiveTransaction);
          })
          .on("broadcast", { event: "transaction_update" }, ({ payload }) => {
            if (payload?.id && payload?.status) {
              optsRef.current.onUpdate?.(payload.id as string, payload.status as string);
            }
          })
          .on("broadcast", { event: "deposit_confirmed" }, ({ payload }) => {
            if (payload?.amount) {
              optsRef.current.onNew?.({
                id:         `live_dep_${Date.now()}`,
                type:       "deposit",
                amount:     Number(payload.amount),
                status:     "completed",
                created_at: new Date().toISOString(),
              });
            }
          })
          .on("broadcast", { event: "withdraw_pending" }, ({ payload }) => {
            if (payload?.txId) {
              optsRef.current.onUpdate?.(payload.txId as string, "pending");
            }
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED")   setIsLive(true);
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              setIsLive(false);
            }
          });
      } catch {
        setIsLive(false);
      }
    })();

    return () => {
      cancelled = true;
      setIsLive(false);
      if (supabase && channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [userId]);

  return { isLive };
}
