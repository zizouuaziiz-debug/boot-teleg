"use client";

import { useEffect, useRef } from "react";

export interface WalletUpdate {
  balance:          number;
  total_earned:     number;
  total_withdrawn:  number;
  coins:            number;
}

/**
 * Subscribes to Supabase Realtime broadcast channel `wallet:{userId}`.
 * Calls `onUpdate` whenever the server broadcasts a wallet mutation.
 *
 * Requirements:
 * - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY must be set
 * - Server routes must call broadcastWalletUpdate() after every wallet change
 * - No DB queries here — purely realtime broadcast listener
 */
export function useRealtimeWallet(
  userId:   string | null,
  onUpdate: (wallet: WalletUpdate) => void
): void {
  // Stable ref so we don't re-subscribe when onUpdate identity changes
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!userId) return;

    // Lazily import to avoid SSR issues
    let channel: ReturnType<ReturnType<typeof import("@supabase/supabase-js")["createClient"]>["channel"]> | null = null;
    let supabase: Awaited<ReturnType<typeof import("../lib/supabase-browser")["getSupabaseBrowser"]>> | null = null;

    let cancelled = false;

    (async () => {
      try {
        const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
        if (cancelled) return;

        supabase  = getSupabaseBrowser();
        channel   = supabase
          .channel(`wallet:${userId}`)
          .on("broadcast", { event: "wallet_update" }, ({ payload }) => {
            if (payload && typeof payload.balance === "number") {
              onUpdateRef.current(payload as WalletUpdate);
            }
          })
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR") {
              console.warn("[Realtime] wallet channel error — will retry on reconnect");
            }
          });
      } catch (err) {
        console.warn("[Realtime] Failed to subscribe:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (supabase && channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [userId]);
}
