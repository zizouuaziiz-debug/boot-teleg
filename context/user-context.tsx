"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRealtimeWallet, type WalletUpdate } from "@/hooks/use-realtime-wallet";

export interface Wallet {
  id:               string;
  user_id:          string;
  balance:          number;
  total_earned:     number;
  total_withdrawn:  number;
  coins:            number;
}

export interface UserProfile {
  id:            string;
  telegram_id:   string;
  username:      string | null;
  first_name:    string | null;
  last_name:     string | null;
  photo_url:     string | null;
  referral_code: string;
  referred_by:   string | null;
  vip_level:     number;
  created_at:    string;
  wallets:       Wallet | Wallet[] | null;
}

interface UserContextType {
  user:          UserProfile | null;
  wallet:        Wallet | null;
  loading:       boolean;
  telegramId:    string | null;
  authHeaders:   HeadersInit;
  refreshUser:   () => Promise<void>;
  refreshWallet: () => Promise<void>;
  logout:        () => void;
  setUser:       (u: UserProfile | null) => void;
  setWallet:     (w: Wallet | null) => void;
}

const UserContext = createContext<UserContextType>({
  user:          null,
  wallet:        null,
  loading:       true,
  telegramId:    null,
  authHeaders:   {},
  refreshUser:   async () => {},
  refreshWallet: async () => {},
  logout:        () => {},
  setUser:       () => {},
  setWallet:     () => {},
});

/** Normalise wallets: Supabase join returns array for 1-to-many */
function normaliseWallet(raw: Wallet | Wallet[] | null | undefined): Wallet | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user,       setUserState] = useState<UserProfile | null>(null);
  const [wallet,     setWalletState] = useState<Wallet | null>(null);
  const [loading,    setLoading]   = useState(true);
  const [telegramId, setTelegramId] = useState<string | null>(null);

  // Stable auth headers for API calls
  const authHeaders: HeadersInit = telegramId
    ? { "Content-Type": "application/json", "x-telegram-id": telegramId }
    : { "Content-Type": "application/json" };

  // ── Realtime wallet subscription ──────────────────────────────────────────
  useRealtimeWallet(user?.id ?? null, (update: WalletUpdate) => {
    setWalletState((prev) =>
      prev
        ? {
            ...prev,
            balance:         update.balance,
            total_earned:    update.total_earned,
            total_withdrawn: update.total_withdrawn,
            coins:           update.coins,
          }
        : null
    );
  });

  // ── Public setters ─────────────────────────────────────────────────────────
  const setUser = useCallback((u: UserProfile | null) => {
    setUserState(u);
    if (u) setWalletState(normaliseWallet(u.wallets));
  }, []);

  const setWallet = useCallback((w: Wallet | null) => setWalletState(w), []);

  // ── Init user from Telegram ──────────────────────────────────────────────
  const initUser = useCallback(async (
    tgUser:    Record<string, unknown>,
    initData?: string,
    refCode?:  string
  ) => {
    try {
      if (!tgUser?.id) { setLoading(false); return; }

      const res = await fetch("/api/auth/telegram", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          telegram_id:   tgUser.id,
          first_name:    tgUser.first_name,
          last_name:     tgUser.last_name,
          username:      tgUser.username,
          photo_url:     tgUser.photo_url,
          referral_code: refCode ?? null,
          init_data:     initData,
        }),
      });

      const data = await res.json();

      if (data?.user) {
        const u = data.user as UserProfile;
        setUserState(u);
        setWalletState(normaliseWallet(u.wallets));
        setTelegramId(String(tgUser.id));

        try {
          localStorage.setItem("tg_user", JSON.stringify(u));
        } catch {}
      }
    } catch (err) {
      console.error("[UserContext] Auth error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Bootstrap from Telegram WebApp SDK ────────────────────────────────────
  useEffect(() => {
    const tg = (window as Window & {
      Telegram?: { WebApp?: Record<string, unknown> }
    })?.Telegram?.WebApp;

    // Extract referral code from URL params
    const urlParams  = new URLSearchParams(window.location.search);
    const refCode    = urlParams.get("ref") ?? urlParams.get("start") ?? undefined;

    const tryInit = () => {
      if (!tg) {
        // Dev fallback: restore from localStorage
        try {
          const stored = localStorage.getItem("tg_user");
          if (stored) {
            const parsed = JSON.parse(stored) as UserProfile;
            setUserState(parsed);
            setWalletState(normaliseWallet(parsed.wallets));
            setTelegramId(parsed.telegram_id ?? null);
          }
        } catch {}
        setLoading(false);
        return;
      }

      // Initialise Telegram WebApp
      if (typeof (tg as { ready?: () => void }).ready === "function") {
        (tg as { ready: () => void }).ready();
      }
      if (typeof (tg as { expand?: () => void }).expand === "function") {
        (tg as { expand: () => void }).expand();
      }

      let tries = 0;
      const poll = () => {
        const unsafe     = (tg as Record<string, unknown>).initDataUnsafe as Record<string, unknown> | undefined;
        const tgUser     = unsafe?.user as Record<string, unknown> | undefined;
        const initData   = (tg as Record<string, unknown>).initData as string | undefined;
        const startParam = (unsafe?.start_param as string | undefined) ?? refCode;

        if (tgUser?.id) {
          initUser(tgUser, initData, startParam);
          return;
        }
        if (tries < 20) {
          tries++;
          setTimeout(poll, 250);
        } else {
          setLoading(false);
        }
      };
      poll();
    };

    tryInit();
  }, [initUser]);

  // ── Refresh helpers ────────────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res  = await fetch("/api/user/me", { headers: authHeaders, cache: "no-store" });
      const data = await res.json();
      if (data?.user) {
        const u = data.user as UserProfile;
        setUserState(u);
        setWalletState(normaliseWallet(u.wallets));
      }
    } catch (err) {
      console.error("[UserContext] refreshUser:", err);
    }
  }, [telegramId, authHeaders]);

  const refreshWallet = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res  = await fetch("/api/wallet/balance", { headers: authHeaders, cache: "no-store" });
      const data = await res.json();
      if (data?.wallet) setWalletState(data.wallet as Wallet);
    } catch (err) {
      console.error("[UserContext] refreshWallet:", err);
    }
  }, [telegramId, authHeaders]);

  const logout = useCallback(() => {
    setUserState(null);
    setWalletState(null);
    setTelegramId(null);
    try { localStorage.removeItem("tg_user"); } catch {}
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        wallet,
        loading,
        telegramId,
        authHeaders,
        refreshUser,
        refreshWallet,
        logout,
        setUser,
        setWallet,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
