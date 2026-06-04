"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Crown,
  Gift,
  Users,
  TrendingUp,
  Zap,
  CheckCircle2,
  Loader2,
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

export function HomeScreen({ onNavigateToEarn }: HomeScreenProps) {
  const { user, wallet, telegramId, authHeaders, refreshWallet } = useUser();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [bonusClaimOpen, setBonusClaimOpen]       = useState(false);
  const [bonusResult, setBonusResult]             = useState<number | null>(null);
  const [bonusClaiming, setBonusClaiming]         = useState(false);

  const [canClaim, setCanClaim]       = useState(false);
  const [currentDay, setCurrentDay]   = useState(1);
  const [claimedToday, setClaimedToday] = useState(false);
  const DAILY_REWARDS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50];

  const [totalReferrals, setTotalReferrals]     = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [activeReferrals, setActiveReferrals]   = useState(0);

  // ⭐️ Spin state
  const [spinsRemaining, setSpinsRemaining] = useState(0);
  const [maxSpins, setMaxSpins] = useState(3);

  const displayName =
    user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.username ||
        "User"
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

  // ⭐️ Fetch spin state
  const fetchSpinState = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/spin", { headers: authHeaders });
      const data = await res.json();
      if (!data.error) {
        setSpinsRemaining(data.spinsRemaining ?? 0);
        setMaxSpins(data.maxSpins ?? 3);
      }
    } catch {}
  }, [telegramId, authHeaders]);

  useEffect(() => {
    fetchSpinState();
  }, [fetchSpinState]);

  const handleClaimBonus = async () => {
    if (!canClaim || bonusClaiming) return;
    setBonusClaiming(true);
    try {
      const res = await fetch("/api/daily-bonus", {
        method:  "POST",
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

  const fetchReferralStats = useCallback(async () => {
    if (!telegramId) return;
    try {
      const res = await fetch("/api/referrals", {
        headers: authHeaders,
        cache:   "no-store",
      });
      const data = await res.json();
      if (!data.error) {
        setTotalReferrals(data.totalReferrals   ?? 0);
        setReferralEarnings(data.totalEarnings  ?? 0);
        setActiveReferrals(data.activeReferrals ?? 0);
      }
    } catch {}
  }, [telegramId, authHeaders]);

  useEffect(() => {
    fetchReferralStats();
    const interval = setInterval(fetchReferralStats, 30000);
    return () => clearInterval(interval);
  }, [fetchReferralStats]);

  return (
    <div className="flex flex-col gap-4 p-4 safe-area-top">
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 ring-2 ring-primary/50">
            {user?.photo_url && (
              <AvatarImage src={user.photo_url} alt={displayName} />
            )}
            <AvatarFallback>{avatarInitials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h2 className="font-semibold">{displayName}</h2>
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen(true)}>
          <Bell className="h-5 w-5" />
        </Button>
      </header>

      {/* BALANCE */}
      <Card>
        <CardContent className="p-5">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Balance</p>
              <h1 className="text-3xl font-bold">
                ${(wallet?.balance ?? 0).toFixed(2)}
              </h1>
            </div>
            <Badge>
              <Crown className="h-3 w-3 mr-1" />
              VIP {user?.vip_level ?? 0}
            </Badge>
          </div>

          <div className="mt-4 flex gap-3">
            <div className="flex-1 p-3 rounded-xl bg-secondary/50">
              <p className="text-xs text-muted-foreground">Coins</p>
              <p className="font-semibold">{(wallet?.coins ?? 0).toLocaleString()}</p>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-secondary/50">
              <p className="text-xs text-muted-foreground">Earned</p>
              <p className="font-semibold text-green-400">
                +${(wallet?.total_earned ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SPIN BUTTON */}
      <Button className="h-14 text-lg" onClick={onNavigateToEarn}>
        <Gift className="mr-2 h-5 w-5" />
        Spin
      </Button>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Zap,         label: "Spins",     value: `${spinsRemaining}/${maxSpins}` },
          { icon: TrendingUp,  label: "Earned",    value: `$${(wallet?.total_earned ?? 0).toFixed(0)}` },
          { icon: Users,       label: "Referrals", value: String(totalReferrals) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="flex flex-col items-center p-3">
              <Icon className="h-5 w-5 text-primary" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DAILY BONUS */}
      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold">Daily Bonus</p>
              <p className="text-xs text-muted-foreground">
                Day {currentDay}/7 — ${(DAILY_REWARDS[currentDay - 1] ?? 0).toFixed(2)} today
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleClaimBonus}
              disabled={!canClaim || bonusClaiming || claimedToday}
            >
              {bonusClaiming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : claimedToday ? (
                "Claimed"
              ) : (
                "Claim"
              )}
            </Button>
          </div>
          <Progress value={(currentDay / 7) * 100} className="mt-3" />
          <div className="mt-2 flex justify-between">
            {DAILY_REWARDS.map((r, i) => (
              <div
                key={i}
                className={`flex flex-col items-center text-[9px] gap-0.5 ${
                  i + 1 < currentDay
                    ? "text-primary"
                    : i + 1 === currentDay
                    ? "text-primary font-bold"
                    : "text-muted-foreground"
                }`}
              >
                <span>{i + 1 < currentDay ? "✓" : i + 1 === currentDay ? "→" : `D${i + 1}`}</span>
                <span>${r.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* REFERRALS CARD */}
      {activeReferrals > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="font-semibold">Referral Earnings</p>
            <p className="text-green-400">
              +${referralEarnings.toFixed(2)} ({activeReferrals} active)
            </p>
          </CardContent>
        </Card>
      )}

      {/* BONUS POPUP */}
      <Dialog open={bonusClaimOpen} onOpenChange={setBonusClaimOpen}>
        <DialogContent className="text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold">Bonus Claimed!</h2>
          <p className="text-green-400 text-2xl mt-2 font-bold">
            +${(bonusResult ?? 0).toFixed(2)} USDT
          </p>
          <p className="text-sm text-muted-foreground mt-1">Day {currentDay} streak</p>
        </DialogContent>
      </Dialog>

      {/* NOTIFICATIONS */}
      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>No notifications yet</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
