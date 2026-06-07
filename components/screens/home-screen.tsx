"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell, Crown, Gift, Users, TrendingUp, Zap, CheckCircle2, Loader2,
  Package, Clock, Sparkles, Diamond, Star, Wallet, PlayCircle,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { useUser } from "@/context/user-context";

interface HomeScreenProps {
  onNavigateToEarn?: () => void;
}

function AnimatedNumber({ value, prefix = "", decimals = 2 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 800;
    const start = display;
    const diff = value - start;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{prefix}{display.toFixed(decimals)}</span>;
}

export function HomeScreen({ onNavigateToEarn }: HomeScreenProps) {
  const { user, wallet, telegramId, authHeaders, refreshWallet } = useUser();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [bonusClaimOpen, setBonusClaimOpen] = useState(false);
  const [bonusResult, setBonusResult] = useState<number | null>(null);
  const [bonusClaiming, setBonusClaiming] = useState(false);

  const [canClaim, setCanClaim] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [claimedToday, setClaimedToday] = useState(false);
  const DAILY_REWARDS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50];

  const [totalReferrals, setTotalReferrals] = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [activeReferrals, setActiveReferrals] = useState(0);

  const [spinsRemaining, setSpinsRemaining] = useState(3);
  const [maxSpins, setMaxSpins] = useState(3);

  const [mysteryReady, setMysteryReady] = useState(false);
  const [mysteryTimeLeft, setMysteryTimeLeft] = useState("");
  const [mysteryOpening, setMysteryOpening] = useState(false);
  const [mysteryReward, setMysteryReward] = useState<number | null>(null);
  const [mysteryOpen, setMysteryOpen] = useState(false);

  const [adsWatched, setAdsWatched] = useState(0);
  const [maxAdsPerDay] = useState(10);
  const [watchingAd, setWatchingAd] = useState(false);

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "User"
    : "Guest";

  const avatarInitials = displayName
    .split(" ")
    .map((n) => n?.[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // ⭐️ Notification listener for Telegram Mini App
  useEffect(() => {
    if (!telegramId) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    let channel: any;
    let client: any;

    const init = async () => {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        client = createClient(url, key, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        channel = client.channel("admin:live", {
          config: { broadcast: { self: true } },
        });

        channel.on("broadcast", { event: "admin_notification" }, (payload: any) => {
          const message = payload.payload?.message || "New notification!";
          const tg = (window as any).Telegram;

          if (tg?.WebApp?.showPopup) {
            tg.WebApp.showPopup({
              title: "📢 Notification",
              message: message,
              buttons: [{ type: "ok" }],
            });
          } else if (tg?.WebApp?.showAlert) {
            tg.WebApp.showAlert(`📢 ${message}`);
          }
        });

        channel.subscribe((status: string) => {
          console.log("Notification channel:", status);
        });
      } catch (error) {
        console.error("Notification init error:", error);
      }
    };

    init();

    return () => {
      if (channel) client?.removeChannel(channel).catch(() => {});
    };
  }, [telegramId]);

  const fetchBonusState = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/daily-bonus", { headers: authHeaders });
      const data = await res.json();
      if (!data.error) {
        setCanClaim(data.canClaim ?? false);
        setCurrentDay(data.currentDay ?? 1);
        setClaimedToday(data.claimed ?? false);
      }
    } catch {}
  }, [telegramId, authHeaders]);

  useEffect(() => { fetchBonusState(); }, [fetchBonusState]);

  const fetchSpinState = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/rewards/spin/status", { headers: authHeaders });
      const data = await res.json();
      if (data && typeof data.spinsRemaining === "number") {
        setSpinsRemaining(data.spinsRemaining);
        setMaxSpins(data.maxSpins ?? 3);
      }
    } catch (error) {}
  }, [telegramId, authHeaders]);

  useEffect(() => { fetchSpinState(); }, [fetchSpinState]);

  const fetchMysteryBox = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/mysterybox", { headers: authHeaders });
      const data = await res.json();
      if (!data.error) {
        setMysteryReady(data.canOpen ?? false);
        setMysteryTimeLeft(data.timeLeft ?? "");
      }
    } catch {}
  }, [telegramId, authHeaders]);

  useEffect(() => {
    fetchMysteryBox();
    const interval = setInterval(fetchMysteryBox, 30000);
    return () => clearInterval(interval);
  }, [fetchMysteryBox]);

  const fetchAdStatus = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/ads/status", { headers: authHeaders });
      const data = await res.json();
      if (!data.error) setAdsWatched(data.watched ?? 0);
    } catch {}
  }, [telegramId, authHeaders]);

  useEffect(() => { fetchAdStatus(); }, [fetchAdStatus]);

  const handleOpenMystery = async () => {
    if (!mysteryReady || mysteryOpening) return;
    setMysteryOpening(true);
    try {
      const res = await fetch("/api/mysterybox", { method: "POST", headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setMysteryReward(data.reward);
        setMysteryReady(false);
        setMysteryOpen(true);
        await refreshWallet();
        await fetchSpinState();
        setTimeout(() => setMysteryOpen(false), 4000);
      }
    } catch {} finally { setMysteryOpening(false); }
  };

  // ⭐️ Ads handlers
  const handleWatchAd = async () => {
  if (watchingAd || adsWatched >= maxAdsPerDay) return;
  setWatchingAd(true);

  try {
    const loadAdsgram = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        if ((window as any).Adsgram) {
          resolve((window as any).Adsgram);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://adsgram.ai/sdk.js';
        script.onload = () => {
          setTimeout(() => {
            if ((window as any).Adsgram) {
              resolve((window as any).Adsgram);
            } else {
              reject(new Error('Adsgram not available after load'));
            }
          }, 1000);
        };
        script.onerror = () => reject(new Error('Failed to load Adsgram'));
        document.head.appendChild(script);
      });
    };

    const Adsgram = await loadAdsgram();
    const controller = Adsgram.init({ blockId: "34448", debug: true });
    await controller.show();

    await refreshWallet();
    await fetchAdStatus();
  } catch (error: any) {
    alert("Error: " + (error?.message || JSON.stringify(error)));
  } finally {
    setWatchingAd(false);
  }
};
  const fetchReferralStats = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/referrals", { headers: authHeaders, cache: "no-store" });
      const data = await res.json();
      if (!data.error) {
        setTotalReferrals(data.totalReferrals ?? 0);
        setReferralEarnings(data.totalEarnings ?? 0);
        setActiveReferrals(data.activeReferrals ?? 0);
      }
    } catch {}
  }, [telegramId, authHeaders]);

  useEffect(() => {
    fetchReferralStats();
    const interval = setInterval(fetchReferralStats, 30000);
    return () => clearInterval(interval);
  }, [fetchReferralStats]);

  const handleClaimBonus = async () => {
    if (!canClaim || bonusClaiming) return;
    setBonusClaiming(true);
    try {
      const res = await fetch("/api/daily-bonus", { method: "POST", headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setBonusResult(data.reward);
        setClaimedToday(true);
        setCanClaim(false);
        setCurrentDay(data.currentDay);
        setBonusClaimOpen(true);
        await refreshWallet();
        setTimeout(() => setBonusClaimOpen(false), 3000);
      }
    } catch {} finally { setBonusClaiming(false); }
  };

  const vipLevel = user?.vip_level ?? 0;
  const vipNames = ["Free", "Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  const vipColors = [
    "from-gray-500 to-gray-600",
    "from-amber-600 to-amber-700",
    "from-gray-300 to-gray-400",
    "from-yellow-400 to-yellow-500",
    "from-cyan-400 to-cyan-500",
    "from-purple-500 to-pink-500",
  ];

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 safe-area-top animate-in fade-in duration-500">
      
      {/* ═══════ HEADER ═══════ */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-11 w-11 ring-2 ring-purple-500/50 shadow-lg shadow-purple-500/20">
              {user?.photo_url && <AvatarImage src={user.photo_url} alt={displayName} />}
              <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-sm">{avatarInitials}</AvatarFallback>
            </Avatar>
            {vipLevel > 0 && (
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5 shadow-lg">
                <Diamond className="h-3 w-3 text-yellow-900" />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-purple-400" />Welcome back
            </p>
            <h2 className="font-bold text-white">{displayName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className={`bg-gradient-to-r ${vipColors[vipLevel] || vipColors[0]} border-0 shadow-lg text-white text-xs`}>
            <Crown className="h-3 w-3 mr-1" />{vipNames[vipLevel] || "Free"}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen(true)} className="relative">
            <Bell className="h-5 w-5 text-gray-400" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
          </Button>
        </div>
      </header>

      {/* ═══════ BALANCE - GLASS MORPHISM | CENTERED ═══════ */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10"
        style={{
          background: "linear-gradient(135deg, rgba(88, 28, 255, 0.1), rgba(147, 51, 234, 0.08), rgba(219, 39, 119, 0.05))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/20 rounded-full blur-3xl -ml-16 -mb-16" />
        
        <div className="relative z-10 flex flex-col items-center justify-center py-10 px-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-4 backdrop-blur">
            <Wallet className="h-4 w-4 text-purple-400" />
            <p className="text-sm text-gray-300">Total Balance</p>
          </div>
          
          <h1 className="text-5xl font-black text-white tracking-tight">
            <AnimatedNumber value={wallet?.balance ?? 0} prefix="$" decimals={2} />
          </h1>
          
          <p className="text-sm text-gray-400 mt-1">USDT</p>
        </div>
      </div>

      {/* ═══════ MYSTERY BOX ═══════ */}
      <div className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${
        mysteryReady ? "border-amber-500/40 shadow-lg shadow-amber-500/20" : "border-white/10"
      }`}
        style={{
          background: mysteryReady 
            ? "linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))" 
            : "linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div className="p-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 flex-shrink-0 ${
              mysteryReady 
                ? "bg-gradient-to-br from-amber-400 to-yellow-600 shadow-lg shadow-amber-500/40 scale-110" 
                : "bg-white/5"
            }`}>
              {mysteryReady ? <Package className="h-8 w-8 text-white animate-bounce" /> : <Clock className="h-8 w-8 text-gray-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white">{mysteryReady ? "🎁 Mystery Box Ready!" : "📦 Mystery Box"}</p>
              <p className="text-sm text-gray-400">{mysteryReady ? "Open now for a random reward up to $2!" : `Available in ${mysteryTimeLeft}`}</p>
              <p className="text-xs text-amber-400 mt-1 font-medium">🎲 $0.10 - $2.00 USDT</p>
            </div>
            <Button onClick={handleOpenMystery} disabled={!mysteryReady || mysteryOpening}
              className={`flex-shrink-0 rounded-xl font-bold ${
                mysteryReady ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-lg shadow-amber-500/30" : "bg-white/10 text-gray-400"
              }`}>
              {mysteryOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : mysteryReady ? "OPEN!" : "Wait"}
            </Button>
          </div>
        </div>
      </div>

      {/* ═══════ SPIN BUTTON ═══════ */}
      <Button 
        className="h-16 text-lg rounded-2xl font-bold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:via-yellow-600 hover:to-amber-600 text-amber-950 shadow-xl shadow-amber-500/30 border-0 transition-all active:scale-95"
        onClick={onNavigateToEarn}
      >
        <Gift className="mr-2 h-6 w-6" />Spin the Wheel
      </Button>

      {/* ═══════ WATCH VIDEO BUTTON ═══════ */}
      <Button 
        className="h-16 text-lg rounded-2xl font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-xl shadow-blue-500/30 border-0 transition-all active:scale-95"
        onClick={handleWatchAd}
        disabled={watchingAd || adsWatched >= maxAdsPerDay}
      >
        <PlayCircle className="mr-2 h-6 w-6" />
        {watchingAd ? "Loading Ad..." : `Watch Video (${adsWatched}/${maxAdsPerDay})`}
      </Button>

      {/* ═══════ STATS ═══════ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Zap, label: "Spins Left", value: `${spinsRemaining}/${maxSpins}`, gradient: "from-blue-500/20 to-cyan-500/10", iconColor: "text-blue-400", border: "border-blue-500/30", shadow: "shadow-blue-500/10" },
          { icon: TrendingUp, label: "Total Earned", value: `$${(wallet?.total_earned ?? 0).toFixed(0)}`, gradient: "from-green-500/20 to-emerald-500/10", iconColor: "text-green-400", border: "border-green-500/30", shadow: "shadow-green-500/10" },
          { icon: Users, label: "Referrals", value: String(totalReferrals), gradient: "from-purple-500/20 to-pink-500/10", iconColor: "text-purple-400", border: "border-purple-500/30", shadow: "shadow-purple-500/10" },
        ].map(({ icon: Icon, label, value, gradient, iconColor, border, shadow }) => (
          <div key={label} className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-4 flex flex-col items-center gap-2 hover:scale-105 transition-transform ${shadow}`}
            style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
            <div className="p-2 rounded-xl bg-white/10"><Icon className={`h-5 w-5 ${iconColor}`} /></div>
            <p className="text-lg font-black text-white">{value}</p>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══════ DAILY BONUS ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="font-bold text-white flex items-center gap-2"><Star className="h-5 w-5 text-yellow-400" />Daily Bonus</p>
              <p className="text-xs text-gray-400 mt-1">Day {currentDay}/7 — Come back tomorrow for more!</p>
            </div>
            <Button size="sm" onClick={handleClaimBonus} disabled={!canClaim || bonusClaiming || claimedToday}
              className={`rounded-xl font-bold ${claimedToday ? "bg-green-500/20 text-green-400" : canClaim ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30" : "bg-white/10 text-gray-500"}`}>
              {bonusClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : claimedToday ? "✓ Claimed" : "Claim"}
            </Button>
          </div>
          <Progress value={(currentDay / 7) * 100} className="h-2 bg-white/10" />
          <div className="mt-3 flex justify-between">
            {DAILY_REWARDS.map((r, i) => (
              <div key={i} className={`flex flex-col items-center text-[10px] gap-1 transition-all ${i + 1 < currentDay ? "text-green-400" : i + 1 === currentDay ? "text-yellow-400 font-bold scale-110" : "text-gray-600"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${i + 1 < currentDay ? "bg-green-500/20" : i + 1 === currentDay ? "bg-yellow-500/20 ring-2 ring-yellow-400/50" : "bg-white/5"}`}>
                  {i + 1 < currentDay ? "✓" : `D${i + 1}`}
                </span>
                <span>${r.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ REFERRALS ═══════ */}
      {activeReferrals > 0 && (
        <div className="rounded-2xl border border-green-500/30 overflow-hidden shadow-lg"
          style={{ background: "rgba(34,197,94,0.05)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-white flex items-center gap-2"><Users className="h-4 w-4 text-green-400" />Referral Earnings</p>
              <p className="text-xs text-gray-400 mt-1">{activeReferrals} active referrals</p>
            </div>
            <p className="text-2xl font-black text-green-400">+${referralEarnings.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* ═══════ DIALOGS ═══════ */}
      <Dialog open={mysteryOpen} onOpenChange={setMysteryOpen}>
        <DialogContent className="text-center border-0 rounded-3xl" style={{ background: "linear-gradient(180deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1))", backdropFilter: "blur(20px)" }}>
          <Package className="h-16 w-16 text-amber-400 mx-auto mb-3 animate-bounce" />
          <h2 className="text-2xl font-black text-white">Mystery Box Opened!</h2>
          <p className="text-amber-400 text-4xl mt-2 font-black">+${(mysteryReward ?? 0).toFixed(2)} USDT</p>
          <p className="text-sm text-gray-400 mt-1">Come back later for another box!</p>
        </DialogContent>
      </Dialog>

      <Dialog open={bonusClaimOpen} onOpenChange={setBonusClaimOpen}>
        <DialogContent className="text-center border-0 rounded-3xl" style={{ background: "linear-gradient(180deg, rgba(34,197,94,0.2), rgba(16,185,129,0.1))", backdropFilter: "blur(20px)" }}>
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white">Bonus Claimed!</h2>
          <p className="text-green-400 text-4xl mt-2 font-black">+${(bonusResult ?? 0).toFixed(2)} USDT</p>
          <p className="text-sm text-gray-400 mt-1">Day {currentDay} streak! 🔥</p>
        </DialogContent>
      </Dialog>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="border-0 rounded-3xl" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white">🔔 Notifications</DialogTitle>
            <DialogDescription className="text-gray-400">You're all caught up!</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
