"use client";

import { useState, useEffect, useCallback } from "react"
import { Copy, Share2, Users, TrendingUp, Gift, Crown, Check, Loader2, Sparkles, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useUser } from "@/context/user-context"

const tiers = [
  { level: 1, name: "Bronze", commission: "10%", requirement: "0-10 referrals", min: 0, max: 10, color: "from-amber-700 to-orange-800", dot: "bg-amber-500" },
  { level: 2, name: "Silver", commission: "15%", requirement: "11-50 referrals", min: 11, max: 50, color: "from-gray-400 to-slate-500", dot: "bg-gray-300" },
  { level: 3, name: "Gold", commission: "20%", requirement: "51-100 referrals", min: 51, max: 100, color: "from-yellow-400 to-amber-500", dot: "bg-yellow-400" },
  { level: 4, name: "Diamond", commission: "25%", requirement: "100+ referrals", min: 101, max: Infinity, color: "from-cyan-400 to-blue-500", dot: "bg-cyan-400" },
]

interface ReferralUser {
  id: string
  first_name: string | null
  username: string | null
  created_at: string
}

interface ReferralData {
  referralCode: string
  referrals: ReferralUser[]
  totalReferrals: number
  activeReferrals: number
  totalEarnings: number
  pendingEarnings: number
  tier: number
  tierName: string
  commission: string
  nextTierProgress: number
  nextTierAt: number
}

function AnimatedNumber({ value, prefix = "", decimals = 2 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const duration = 800; const start = display; const diff = value - start; const startTime = Date.now()
    const animate = () => {
      const elapsed = Date.now() - startTime; const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3); setDisplay(start + diff * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [value])
  return <span>{prefix}{display.toFixed(decimals)}</span>
}

export function ReferralsScreen() {
  const { telegramId, authHeaders } = useUser()
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [allReferralsOpen, setAllReferralsOpen] = useState(false)

  const fetchReferrals = useCallback(async () => {
    if (!telegramId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch("/api/referrals", { headers: authHeaders })
      const json = await res.json()
      if (!json.error) setData(json)
    } catch {} finally { setLoading(false) }
  }, [telegramId, authHeaders])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  const referralCode = data?.referralCode ?? "—"
  const botUsername  = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "GoldenTaskBot"
  const referralLink = data ? `https://t.me/${botUsername}?start=${data.referralCode}` : ""

  const copyCode = () => { if (!data) return; navigator.clipboard.writeText(referralCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000) }
  const copyLink = () => { if (!data) return; navigator.clipboard.writeText(referralLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }
  const shareLink = async () => { if (!data) return; if (navigator.share) { await navigator.share({ title: "Join GoldenTask", text: "Earn USDT! Use my referral code.", url: referralLink }) } }

  const currentTier = tiers.find((t) => t.level === (data?.tier ?? 1)) ?? tiers[0]
  const nextTier = tiers.find((t) => t.level === (data?.tier ?? 1) + 1)

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 safe-area-top">
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 safe-area-top animate-in fade-in duration-500">
      
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/30">
          <Users className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Referrals</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-purple-400" />Earn by inviting friends
          </p>
        </div>
      </div>

      {/* ═══════ STATS ═══════ */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 border border-blue-500/30"
          style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(6,182,212,0.05))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-blue-500/20"><Users className="h-4 w-4 text-blue-400" /></div>
            <p className="text-xs text-gray-400">Total Referrals</p>
          </div>
          <p className="text-3xl font-black text-white">{data?.totalReferrals ?? 0}</p>
          <p className="text-xs text-green-400 mt-1">{data?.activeReferrals ?? 0} active</p>
        </div>
        <div className="rounded-2xl p-4 border border-green-500/30"
          style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(16,185,129,0.05))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-green-500/20"><TrendingUp className="h-4 w-4 text-green-400" /></div>
            <p className="text-xs text-gray-400">Total Earnings</p>
          </div>
          <p className="text-3xl font-black text-green-400">
            <AnimatedNumber value={data?.totalEarnings ?? 0} prefix="$" />
          </p>
          <p className="text-xs text-gray-400 mt-1">+${(data?.pendingEarnings ?? 0).toFixed(2)} pending</p>
        </div>
      </div>

      {/* ═══════ REFERRAL CODE ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4">
          <p className="text-sm text-gray-400 mb-3">🔗 Your Referral Code</p>
          <div className="flex items-center gap-2 mb-3">
            <Input value={referralCode} readOnly className="bg-white/5 border-white/10 text-center font-mono text-lg font-bold text-purple-400 rounded-xl" />
            <Button size="icon" variant="outline" onClick={copyCode} className="flex-shrink-0 border-white/10 rounded-xl">
              {codeCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
            </Button>
          </div>
          {referralLink && (
            <div className="flex items-center gap-2 mb-3">
              <Input value={referralLink} readOnly className="bg-white/5 border-white/10 text-xs text-gray-400 rounded-xl" />
              <Button size="icon" variant="outline" onClick={copyLink} className="flex-shrink-0 border-white/10 rounded-xl">
                {linkCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
              </Button>
            </div>
          )}
          <Button onClick={shareLink} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold h-12 shadow-lg shadow-purple-500/20">
            <Share2 className="mr-2 h-5 w-5" />Share & Invite Friends
          </Button>
        </div>
      </div>

      {/* ═══════ TIER PROGRESS ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-yellow-500/20"><Crown className="h-4 w-4 text-yellow-400" /></div>
              <span className="font-bold text-white">Tier {data?.tier ?? 1} — {data?.tierName ?? "Bronze"}</span>
            </div>
            <Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-900 border-0 font-bold">{data?.commission ?? "10%"}</Badge>
          </div>
          <Progress value={data?.nextTierProgress ?? 0} className="h-2.5 bg-white/10 rounded-full" />
          {nextTier ? (
            <p className="text-xs text-gray-400 mt-2">
              {data?.totalReferrals ?? 0}/{data?.nextTierAt ?? nextTier.min} referrals to <span className="text-yellow-400 font-bold">{nextTier.name}</span> tier
            </p>
          ) : (
            <p className="text-xs text-green-400 mt-2 font-bold flex items-center gap-1"><Trophy className="h-3 w-3" />Maximum tier reached!</p>
          )}
        </div>
      </div>

      {/* ═══════ COMMISSION TIERS ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4">
          <p className="font-bold text-white mb-3">📊 Commission Tiers</p>
          <div className="space-y-2">
            {tiers.map((tier) => (
              <div key={tier.level} className={`flex items-center justify-between rounded-xl p-3 transition-all ${
                tier.level === (data?.tier ?? 1) 
                  ? "bg-gradient-to-r from-purple-500/20 to-pink-500/10 border border-purple-500/30" 
                  : "bg-white/5 border border-white/5"
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold bg-gradient-to-r ${tier.color} text-white shadow-lg`}>
                    {tier.level}
                  </span>
                  <div>
                    <p className="font-bold text-white text-sm">{tier.name}</p>
                    <p className="text-xs text-gray-400">{tier.requirement}</p>
                  </div>
                </div>
                <Badge className={`${tier.level === (data?.tier ?? 1) ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-900" : "bg-white/10 text-gray-400"} border-0 font-bold`}>
                  {tier.commission}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ REFERRALS LIST ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-white">👥 Your Referrals</p>
            {(data?.referrals?.length ?? 0) > 3 && (
              <Button variant="ghost" size="sm" className="text-purple-400" onClick={() => setAllReferralsOpen(true)}>View All →</Button>
            )}
          </div>
          {(data?.referrals?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Users className="h-12 w-12 text-gray-600 mb-3" />
              <p className="text-gray-400">No referrals yet</p>
              <p className="text-xs text-gray-500 mt-1">Share your code to start earning commissions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.referrals ?? []).slice(0, 3).map((ref) => {
                const name = ref.first_name || ref.username || "User"
                const initials = name.slice(0, 2).toUpperCase()
                return (
                  <div key={ref.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 border border-white/5">
                    <Avatar className="h-10 w-10 ring-2 ring-purple-500/30">
                      <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-white text-sm">{name}</p>
                      <p className="text-xs text-gray-400">Joined {new Date(ref.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ TIPS ═══════ */}
      <div className="rounded-2xl border border-purple-500/20 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(147,51,234,0.08), rgba(219,39,119,0.05))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 shadow-lg shadow-purple-500/30">
            <Gift className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white">Earn More with Referrals</p>
            <p className="mt-1 text-sm text-gray-400">
              Invite friends and earn <span className="text-purple-400 font-bold">{data?.commission ?? "10%"}</span> of their lifetime earnings. The more active referrals you have, the higher your tier and commission rate!
            </p>
          </div>
        </div>
      </div>

      {/* ═══════ ALL REFERRALS DIALOG ═══════ */}
      <Dialog open={allReferralsOpen} onOpenChange={setAllReferralsOpen}>
        <DialogContent className="border-0 rounded-3xl max-h-[80vh] overflow-y-auto"
          style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-purple-400" />All Referrals ({data?.totalReferrals ?? 0})
            </DialogTitle>
            <DialogDescription className="text-gray-400">Your complete referral list</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(data?.referrals ?? []).map((ref) => {
              const name = ref.first_name || ref.username || "User"
              const initials = name.slice(0, 2).toUpperCase()
              return (
                <div key={ref.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 border border-white/5">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-white text-sm">{name}</p>
                    <p className="text-xs text-gray-400">Joined {new Date(ref.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400 border-0 text-xs font-bold">Active</Badge>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
