"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell, Crown, Gift, Users, TrendingUp, Zap, CheckCircle2, Loader2,
  Package, Clock, Wallet, Sparkles, ChevronRight, Star, Diamond, Gem,
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

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "User"
    : "Guest";

  const avatarInitials = displayName
    .split(" ")
    .map((n) => n?.[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

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

  useEffect(() => {
    fetchBonusState();
  }, [fetchBonusState]);

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

  useEffect(() => {
    fetchSpinState();
  }, [fetchSpinState]);

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

  const handleOpenMystery = async () => {
    if (!mysteryReady || mysteryOpening) return;
    setMysteryOpening(true);
    try {
      const res = await fetch("/api/mysterybox", {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      if (data.success) {
        setMysteryReward(data.reward);
        setMysteryReady(false);
        setMysteryOpen(true);
        await refreshWallet();
        await fetchSpinState();
        setTimeout(() => setMysteryOpen(false), 4000);
      }
    } catch {} finally {
      setMysteryOpening(false);
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
      const res = await fetch("/api/daily-bonus", {
        method: "POST",
        headers: authHeaders,
      });
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
    } catch {} finally {
      setBonusClaiming(false);
    }
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
            <Avatar className="h-12 w-12 ring-2 ring-primary/50 shadow-lg shadow-primary/20">
              {user?.photo_url && (
                <AvatarImage src={user.photo_url} alt={displayName} />
              )}
              <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
                {avatarInitials}
              </AvatarFallback>
            </Avatar>
            {vipLevel > 0 && (
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5 shadow-lg">
                <Diamond className="h-3 w-3 text-yellow-900" />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              Welcome back
            </p>
            <h2 className="font-bold text-lg">{displayName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className={`bg-gradient-to-r ${vipColors[vipLevel] || vipColors[0]} border-0 shadow-lg`}>
            <Crown className="h-3 w-3 mr-1" />
            {vipNames[vipLevel] || "Free"}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen(true)} className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
          </Button>
        </div>
      </header>

      {/* ═══════ BALANCE CARD ═══════ */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#1a1040] via-[#120b2e] to-[#0f0825] shadow-2xl shadow-purple-900/30">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-purple-600/20 rounded-full blur-3xl -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-600/20 rounded-full blur-3xl -ml-16 -mb-16" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-purple-400" />
              <p className="text-sm text-purple-300">Total Balance</p>
            </div>
            <h1 className="text-5xl font-black text-white tracking-tight">
              <AnimatedNumber value={wallet?.balance ?? 0} prefix="$" decimals={2} />
            </h1>
            <p className="text-xs text-purple-400 mt-1">USDT</p>

            <div className="flex gap-2 mt-6">
              <Button 
                onClick={() => {}} 
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 shadow-lg shadow-purple-900/40 border-0 h-12 rounded-xl font-semibold"
              >
                💰 Deposit
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 border-purple-500/50 text-purple-300 hover:bg-purple-500/10 h-12 rounded-xl font-semibold"
              >
                💸 Withdraw
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ MYSTERY BOX ═══════ */}
      <Card className={`overflow-hidden border-0 shadow-xl transition-all duration-500 ${
        mysteryReady 
          ? "bg-gradient-to-r from-amber-900/40 to-yellow-900/40 shadow-amber-500/20 animate-pulse" 
          : "bg-gradient-to-r from-[#1a1a2e] to-[#16213e]"
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
              mysteryReady 
                ? "bg-gradient-to-br from-amber-400 to-yellow-600 shadow-lg shadow-amber-500/40 scale-110" 
                : "bg-white/5"
            }`}>
              {mysteryReady ? (
                <Package className="h-8 w-8 text-white animate-bounce" />
              ) : (
                <Clock className="h-8 w-8 text-gray-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-bold text-lg">
                {mysteryReady ? "🎁 Mystery Box Ready!" : "📦 Mystery Box"}
              </p>
              <p className="text-sm text-gray-400">
                {mysteryReady
                  ? "Open now for a random reward up to $5!"
                  : `Available in ${mysteryTimeLeft}`}
              </p>
              <p className="text-xs text-amber-400 mt-1 font-medium">
                🎲 $0.10 - $5.00 USDT
              </p>
            </div>
            <Button
              onClick={handleOpenMystery}
              disabled={!mysteryReady || mysteryOpening}
              className={`flex-shrink-0 rounded-xl font-bold ${
                mysteryReady
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-lg shadow-amber-500/30"
                  : "bg-white/10 text-gray-400"
              }`}
            >
              {mysteryOpening ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mysteryReady ? (
                "OPEN!"
              ) : (
                "Wait"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ SPIN BUTTON ═══════ */}
      <Button 
        className="h-16 text-lg rounded-2xl font-bold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:via-yellow-600 hover:to-amber-600 text-amber-950 shadow-xl shadow-amber-500/30 border-0 transition-all active:scale-95"
        onClick={onNavigateToEarn}
      >
        <Gift className="mr-2 h-6 w-6" />
        Spin the Wheel
        <ChevronRight className="ml-2 h-5 w-5" />
      </Button>

      {/* ═══════ STATS ═══════ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { 
            icon: Zap, 
            label: "Spins Left", 
            value: `${spinsRemaining}/${maxSpins}`,
            gradient: "from-blue-500/20 to-cyan-500/10",
            iconColor: "text-blue-400",
            borderColor: "border-blue-500/30",
          },
          { 
            icon: TrendingUp, 
            label: "Total Earned", 
            value: `$${(wallet?.total_earned ?? 0).toFixed(0)}`,
            gradient: "from-green-500/20 to-emerald-500/10",
            iconColor: "text-green-400",
            borderColor: "border-green-500/30",
          },
          { 
            icon: Users, 
            label: "Referrals", 
            value: String(totalReferrals),
            gradient: "from-purple-500/20 to-pink-500/10",
            iconColor: "text-purple-400",
            borderColor: "border-purple-500/30",
          },
        ].map(({ icon: Icon, label, value, gradient, iconColor, borderColor }) => (
          <Card key={label} className={`bg-gradient-to-br ${gradient} border ${borderColor} shadow-lg hover:scale-105 transition-transform`}>
            <CardContent className="flex flex-col items-center p-4 gap-2">
              <div className={`p-2 rounded-xl bg-white/10`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <p className="text-xl font-black">{value}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══════ DAILY BONUS ═══════ */}
      <Card className="border-0 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-xl">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="font-bold text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-400" />
                Daily Bonus
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Day {currentDay}/7 — Come back tomorrow for more!
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleClaimBonus}
              disabled={!canClaim || bonusClaiming || claimedToday}
              className={`rounded-xl font-bold ${
                claimedToday 
                  ? "bg-green-500/20 text-green-400" 
                  : canClaim 
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30"
                    : "bg-white/10 text-gray-500"
              }`}
            >
              {bonusClaiming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : claimedToday ? (
                "✓ Claimed"
              ) : (
                "Claim"
              )}
            </Button>
          </div>
          <Progress value={(currentDay / 7) * 100} className="h-2 bg-white/10" />
          <div className="mt-3 flex justify-between">
            {DAILY_REWARDS.map((r, i) => (
              <div
                key={i}
                className={`flex flex-col items-center text-[10px] gap-1 transition-all ${
                  i + 1 < currentDay
                    ? "text-green-400"
                    : i + 1 === currentDay
                    ? "text-yellow-400 font-bold scale-110"
                    : "text-gray-600"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  i + 1 < currentDay 
                    ? "bg-green-500/20" 
                    : i + 1 === currentDay 
                      ? "bg-yellow-500/20 ring-2 ring-yellow-400/50"
                      : "bg-white/5"
                }`}>
                  {i + 1 < currentDay ? "✓" : `D${i + 1}`}
                </span>
                <span>${r.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══════ REFERRALS ═══════ */}
      {activeReferrals > 0 && (
        <Card className="border-0 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border border-green-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-400" />
                  Referral Earnings
                </p>
                <p className="text-xs text-gray-400 mt-1">{activeReferrals} active referrals</p>
              </div>
              <p className="text-2xl font-black text-green-400">
                +${referralEarnings.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════ DIALOGS ═══════ */}
      <Dialog open={mysteryOpen} onOpenChange={setMysteryOpen}>
        <DialogContent className="text-center border-0 bg-gradient-to-b from-amber-900/50 to-yellow-900/50">
          <Package className="h-16 w-16 text-amber-400 mx-auto mb-3 animate-bounce" />
          <h2 className="text-2xl font-black">Mystery Box Opened!</h2>
          <p className="text-amber-400 text-4xl mt-2 font-black">
            +${(mysteryReward ?? 0).toFixed(2)} USDT
          </p>
          <p className="text-sm text-gray-400 mt-1">Come back later for another box!</p>
        </DialogContent>
      </Dialog>

      <Dialog open={bonusClaimOpen} onOpenChange={setBonusClaimOpen}>
        <DialogContent className="text-center border-0 bg-gradient-to-b from-green-900/50 to-emerald-900/50">
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-3" />
          <h2 className="text-2xl font-black">Bonus Claimed!</h2>
          <p className="text-green-400 text-4xl mt-2 font-black">
            +${(bonusResult ?? 0).toFixed(2)} USDT
          </p>
          <p className="text-sm text-gray-400 mt-1">Day {currentDay} streak! 🔥</p>
        </DialogContent>
      </Dialog>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="border-0 bg-gradient-to-b from-[#1a1a2e] to-[#16213e]">
          <DialogHeader>
            <DialogTitle>🔔 Notifications</DialogTitle>
            <DialogDescription>You're all caught up!</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
