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

  const authHeaders: HeadersInit = telegramId
    ? { "Content-Type": "application/json", "x-telegram-id": telegramId }
    : { "Content-Type": "application/json" };

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

  const setUser = useCallback((u: UserProfile | null) => {
    setUserState(u);
    if (u) setWalletState(normaliseWallet(u.wallets));
  }, []);

  const setWallet = useCallback((w: Wallet | null) => setWalletState(w), []);

  const initUser = useCallback(async (
    tgUser:    Record<string, unknown>,
    initData?: string,
    refCode?:  string
  ) => {
    try {
      if (!tgUser?.id) { setLoading(false); return; }

      console.log("[UserContext] 🚀 Sending to API - refCode:", refCode);

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
        try { localStorage.setItem("tg_user", JSON.stringify(u)); } catch {}
      }
    } catch (err) {
      console.error("[UserContext] Auth error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tg = (window as Window & {
      Telegram?: { WebApp?: Record<string, unknown> }
    })?.Telegram?.WebApp;

    const tryInit = () => {
      if (!tg) {
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

      if (typeof (tg as { ready?: () => void }).ready === "function") {
        (tg as { ready: () => void }).ready();
      }
      if (typeof (tg as { expand?: () => void }).expand === "function") {
        (tg as { expand: () => void }).expand();
      }

      let tries = 0;
      const poll = () => {
        const tgAny       = tg as Record<string, unknown>;
        const unsafe      = tgAny.initDataUnsafe as Record<string, unknown> | undefined;
        const tgUser      = unsafe?.user as Record<string, unknown> | undefined;
        const initDataStr = tgAny.initData as string | undefined;
        
        // ⭐️⭐️⭐️ استخراج start_param بثلاث طرق مختلفة ⭐️⭐️⭐️
        let startParam: string | undefined;
        
        // طريقة 1: من initDataUnsafe
        if (unsafe?.start_param) {
          startParam = unsafe.start_param as string;
        }
        
        // طريقة 2: من initData النصية
        if (!startParam && initDataStr) {
          try {
            const params = new URLSearchParams(initDataStr);
            startParam = params.get("start_param") ?? undefined;
          } catch {}
        }
        
        // طريقة 3: من window.location (للحالات النادرة)
        if (!startParam) {
          const urlParams = new URLSearchParams(window.location.search);
          startParam = urlParams.get("start") ?? urlParams.get("ref") ?? undefined;
        }
        
        console.log("[UserContext] 📍 Poll #" + (tries + 1));
        console.log("[UserContext] 👤 tgUser:", !!tgUser);
        console.log("[UserContext] 🎫 startParam:", startParam);

        if (tgUser?.id) {
          initUser(tgUser, initDataStr, startParam);
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
