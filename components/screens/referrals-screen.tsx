"use client";

import { useState, useEffect, useCallback } from "react"
import { Copy, Share2, Users, TrendingUp, Gift, Crown, Check, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useUser } from "@/context/user-context"

const tiers = [
  { level: 1, name: "Bronze", commission: "10%", requirement: "0-10 referrals", min: 0, max: 10 },
  { level: 2, name: "Silver", commission: "15%", requirement: "11-50 referrals", min: 11, max: 50 },
  { level: 3, name: "Gold", commission: "20%", requirement: "51-100 referrals", min: 51, max: 100 },
  { level: 4, name: "Diamond", commission: "25%", requirement: "100+ referrals", min: 101, max: Infinity },
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
    } catch {}
    finally { setLoading(false) }
  }, [telegramId, authHeaders])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  const referralCode = data?.referralCode ?? "—"
  const botUsername  = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "GoldenTaskBot"
  const referralLink = data ? `https://t.me/${botUsername}?start=${data.referralCode}` : ""

  const copyCode = () => {
    if (!data) return
    navigator.clipboard.writeText(referralCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const copyLink = () => {
    if (!data) return
    navigator.clipboard.writeText(referralLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const shareLink = async () => {
    if (!data) return
    if (navigator.share) {
      await navigator.share({ title: "Join GoldenTask", text: "Earn USDT by watching videos! Use my referral code.", url: referralLink })
    }
  }

  const currentTier = tiers.find((t) => t.level === (data?.tier ?? 1)) ?? tiers[0]
  const nextTier = tiers.find((t) => t.level === (data?.tier ?? 1) + 1)

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 safe-area-top">
        <h1 className="text-2xl font-bold text-foreground">Referrals</h1>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 safe-area-top">
      <h1 className="text-2xl font-bold text-foreground">Referrals</h1>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="glass-card primary-glow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Total Referrals</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{data?.totalReferrals ?? 0}</p>
            <p className="text-xs text-success">{data?.activeReferrals ?? 0} active</p>
          </CardContent>
        </Card>
        <Card className="glass-card primary-glow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              <p className="text-sm text-muted-foreground">Total Earnings</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-gradient">${(data?.totalEarnings ?? 0).toFixed(2)}</p>
            <p className="text-xs text-primary">+${(data?.pendingEarnings ?? 0).toFixed(2)} pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Referral Code */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Your Referral Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={referralCode} readOnly className="bg-primary/10 text-center font-mono text-lg font-bold text-primary" />
            <Button size="icon" variant="outline" onClick={copyCode} className="flex-shrink-0">
              {codeCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {referralLink && (
            <div className="flex items-center gap-2">
              <Input value={referralLink} readOnly className="bg-secondary/50 text-xs" />
              <Button size="icon" variant="outline" onClick={copyLink} className="flex-shrink-0">
                {linkCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <Button onClick={shareLink} className="primary-gradient w-full">
            <Share2 className="mr-2 h-4 w-4" />
            Share & Invite Friends
          </Button>
        </CardContent>
      </Card>

      {/* Tier Progress */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Tier {data?.tier ?? 1} - {data?.tierName ?? "Bronze"}</span>
            </div>
            <Badge className="primary-gradient border-0">{data?.commission ?? "10%"} Commission</Badge>
          </div>
          <Progress value={data?.nextTierProgress ?? 0} className="h-2 mb-2" />
          {nextTier ? (
            <p className="text-xs text-muted-foreground">
              {data?.totalReferrals ?? 0}/{data?.nextTierAt ?? nextTier.min} referrals to {nextTier.name} tier
            </p>
          ) : (
            <p className="text-xs text-success">Maximum tier reached!</p>
          )}
        </CardContent>
      </Card>

      {/* Commission Tiers */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commission Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tiers.map((tier) => (
              <div key={tier.level} className={`flex items-center justify-between rounded-lg p-3 ${tier.level === (data?.tier ?? 1) ? "bg-primary/20 border border-primary/50" : "bg-secondary/30"}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    tier.level === 1 ? "bg-orange-700 text-orange-100" :
                    tier.level === 2 ? "bg-slate-400 text-slate-900" :
                    tier.level === 3 ? "primary-gradient text-primary-foreground" :
                    "bg-cyan-500 text-cyan-950"
                  }`}>{tier.level}</span>
                  <div>
                    <p className="font-medium text-foreground">{tier.name}</p>
                    <p className="text-xs text-muted-foreground">{tier.requirement}</p>
                  </div>
                </div>
                <Badge variant={tier.level === (data?.tier ?? 1) ? "default" : "outline"} className={tier.level === (data?.tier ?? 1) ? "primary-gradient border-0" : ""}>{tier.commission}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Referrals List */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Your Referrals</CardTitle>
            {(data?.referrals?.length ?? 0) > 3 && (
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => setAllReferralsOpen(true)}>View All</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(data?.referrals?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No referrals yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Share your code to start earning commissions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.referrals ?? []).slice(0, 3).map((ref) => {
                const name = ref.first_name || ref.username || "User"
                const initials = name.slice(0, 2).toUpperCase()
                return (
                  <div key={ref.id} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-secondary text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">Joined {new Date(ref.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 flex-shrink-0">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Earn More with Referrals</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Invite friends and earn {data?.commission ?? "10%"} of their lifetime earnings. The more active referrals you have, the higher your tier and commission rate!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Referrals Dialog */}
      <Dialog open={allReferralsOpen} onOpenChange={setAllReferralsOpen}>
        <DialogContent className="glass-card border-primary/20 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              All Referrals ({data?.totalReferrals ?? 0})
            </DialogTitle>
            <DialogDescription>Your complete referral list</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(data?.referrals ?? []).map((ref) => {
              const name = ref.first_name || ref.username || "User"
              const initials = name.slice(0, 2).toUpperCase()
              return (
                <div key={ref.id} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-secondary text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">Joined {new Date(ref.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge className="bg-success/20 text-success border-0 text-[10px]">Active</Badge>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
