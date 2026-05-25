"use client";

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Zap, Crown, Lock, CheckCircle2, TrendingUp, Clock,
  Users, ChevronRight, Cpu, RefreshCw, History,
  Sparkles, Flame, ArrowUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useUser } from "@/context/user-context"

// ─── Types ───────────────────────────────────────────────────────────────────

interface MiningRate {
  daily_rate: number
  min_vip: number
  duration_hours: number
  name: string
  color: string
}

interface MiningSession {
  plan_id: string
  plan_name: string
  start_time: number
  end_time: number
  daily_rate: number
  balance_at_start: number
  duration_hours: number
}

interface HistoryEntry {
  id: string
  amount: number
  source: string
  created_at: string
}

interface MiningStatus {
  session: MiningSession | null
  vip_level: number
  balance: number
  total_earned: number
  rates: Record<string, MiningRate>
  history: HistoryEntry[]
}

// ─── Plan Metadata ────────────────────────────────────────────────────────────

const PLAN_META: Record<string, {
  icon: string
  label: string
  gradient: string
  glow: string
  border: string
  particle: string
  speed: string
}> = {
  basic:   { icon: "⚡", label: "Basic",   gradient: "from-slate-500 via-slate-600 to-slate-700",        glow: "rgba(100,116,139,0.6)",  border: "rgba(100,116,139,0.4)", particle: "#94a3b8", speed: "Starter"  },
  silver:  { icon: "🥈", label: "Silver",  gradient: "from-slate-300 via-slate-400 to-slate-500",        glow: "rgba(148,163,184,0.7)",  border: "rgba(148,163,184,0.5)", particle: "#cbd5e1", speed: "Standard" },
  gold:    { icon: "🥇", label: "Gold",    gradient: "from-amber-400 via-yellow-500 to-amber-600",       glow: "rgba(251,191,36,0.7)",   border: "rgba(251,191,36,0.5)",  particle: "#fbbf24", speed: "Advanced" },
  diamond: { icon: "💎", label: "Diamond", gradient: "from-cyan-400 via-sky-500 to-blue-600",            glow: "rgba(34,211,238,0.7)",   border: "rgba(34,211,238,0.5)",  particle: "#22d3ee", speed: "Pro"      },
  ultimate:{ icon: "🚀", label: "Ultimate",gradient: "from-violet-400 via-purple-500 to-fuchsia-700",    glow: "rgba(167,139,250,0.8)",  border: "rgba(167,139,250,0.6)", particle: "#a78bfa", speed: "MAX"      },
}

const PLAN_ORDER = ["basic", "silver", "gold", "diamond", "ultimate"]

const VIP_LABELS = ["Free", "Bronze", "Silver", "Gold", "Platinum", "Diamond"]
const VIP_COLORS = ["#94a3b8", "#b45309", "#94a3b8", "#eab308", "#22d3ee", "#a855f7"]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number) {
  if (seconds <= 0) return "00:00:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

// ─── Particles ───────────────────────────────────────────────────────────────

function MiningParticles({ color, active }: { color: string; active: boolean }) {
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-0"
          style={{
            width: `${4 + (i % 3) * 3}px`,
            height: `${4 + (i % 3) * 3}px`,
            backgroundColor: color,
            left: `${10 + i * 11}%`,
            bottom: "10%",
            boxShadow: `0 0 6px ${color}`,
            animation: `floatUp ${1.5 + i * 0.25}s ease-in ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);   opacity: 0; }
          15%  { opacity: 0.8; }
          80%  { opacity: 0.4; }
          100% { transform: translateY(-90px) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ─── Live Ticker ─────────────────────────────────────────────────────────────

function LiveTicker({ value, color }: { value: number; color: string }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (value !== prev.current) { setFlash(true); setTimeout(() => setFlash(false), 300) }
    prev.current = value
  }, [value])

  return (
    <span
      className="font-mono tabular-nums transition-all duration-300"
      style={{ color: flash ? "#fff" : color, textShadow: `0 0 16px ${color}` }}
    >
      ${value.toFixed(6)}
    </span>
  )
}

// ─── Active Session Card ──────────────────────────────────────────────────────

function ActiveSessionCard({ session, onClaim, isClaiming }: {
  session: MiningSession
  onClaim: () => void
  isClaiming: boolean
}) {
  const meta = PLAN_META[session.plan_id] ?? PLAN_META.basic
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed   = (now - session.start_time) / 1000
  const totalSec  = session.duration_hours * 3600
  const remaining = Math.max(session.end_time - now, 0) / 1000
  const progress  = Math.min((elapsed / totalSec) * 100, 100)
  const elapsedH  = Math.min((now - session.start_time) / 3600000, session.duration_hours)
  const claimable = session.balance_at_start * session.daily_rate * (elapsedH / 24)
  const maxEarn   = session.balance_at_start * session.daily_rate * (session.duration_hours / 24)
  const speedHr   = session.balance_at_start * session.daily_rate / 24
  const done      = remaining <= 0

  return (
    <div
      className="relative rounded-2xl border overflow-hidden"
      style={{ borderColor: meta.border, boxShadow: `0 0 40px ${meta.glow}50, inset 0 0 40px ${meta.glow}08` }}
    >
      {/* animated top bar */}
      <div className={cn("h-1 w-full bg-gradient-to-r", meta.gradient)}
        style={{ animation: done ? "none" : "shimmer 2s linear infinite", backgroundSize: "200%" }}
      />
      <style>{`@keyframes shimmer{0%{background-position:0%}100%{background-position:200%}}`}</style>

      <MiningParticles color={meta.particle} active={!done} />

      <div className="relative z-10 p-4 space-y-4">

        {/* Plan header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br shadow-lg", meta.gradient)}
              style={{ boxShadow: `0 0 20px ${meta.glow}` }}
            >
              {meta.icon}
            </div>
            <div>
              <p className="font-bold text-foreground">{session.plan_name}</p>
              <p className="text-xs text-muted-foreground">{(session.daily_rate * 100).toFixed(1)}% / day</p>
            </div>
          </div>
          <Badge className={cn("border font-semibold", done
            ? "bg-green-500/20 border-green-500/60 text-green-300"
            : "bg-black/40 border-white/10 text-white"
          )}>
            {done ? "✅ Ready!" : <><span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse mr-1.5" />Mining</>}
          </Badge>
        </div>

        {/* Live earnings */}
        <div className="rounded-xl bg-black/40 border border-white/5 p-4 text-center"
          style={{ boxShadow: `inset 0 0 24px ${meta.glow}10` }}
        >
          <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-widest">Live Earnings</p>
          <div className="text-4xl font-bold">
            <LiveTicker value={claimable} color={done ? "#4ade80" : "white"} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">USDT</p>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {done ? "Session complete!" : formatDuration(Math.floor(remaining)) + " left"}
            </span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full bg-black/40 overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${meta.glow.replace("0.6","0.8")}, white)`,
                boxShadow: `0 0 10px ${meta.glow}`,
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Speed", value: `$${speedHr.toFixed(5)}/h` },
            { label: "Daily", value: `$${(session.balance_at_start * session.daily_rate).toFixed(4)}` },
            { label: "Max Earn", value: `$${maxEarn.toFixed(4)}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-black/30 border border-white/5 p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-xs font-bold text-foreground mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Claim button */}
        <Button
          className="w-full h-12 font-bold text-base"
          style={done
            ? { background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 0 20px rgba(34,197,94,0.4)", color: "#fff" }
            : { background: `linear-gradient(135deg,${meta.glow.replace("0.6","0.5")},${meta.glow.replace("0.6","0.25")})`, color: "#fff" }
          }
          onClick={onClaim}
          disabled={isClaiming || claimable <= 0}
        >
          {isClaiming
            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Claiming...</>
            : <><CheckCircle2 className="h-4 w-4 mr-2" />Claim ${claimable.toFixed(4)} USDT</>
          }
        </Button>
      </div>
    </div>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ planId, rate, vipLevel, isAnyActive, onStart, isStarting, balance }: {
  planId: string
  rate: MiningRate
  vipLevel: number
  isAnyActive: boolean
  onStart: (id: string) => void
  isStarting: string | null
  balance: number
}) {
  const meta    = PLAN_META[planId] ?? PLAN_META.basic
  const locked  = vipLevel < rate.min_vip
  const noFunds = balance <= 0
  const busy    = isStarting === planId
  const canStart = !locked && !noFunds && !isAnyActive && !busy

  const dailyEarn   = balance * rate.daily_rate
  const sessionEarn = dailyEarn * (rate.duration_hours / 24)

  return (
    <div
      className={cn(
        "relative rounded-2xl border overflow-hidden transition-all duration-300",
        locked ? "opacity-55" : "hover:scale-[1.015] cursor-pointer"
      )}
      style={{
        borderColor: meta.border,
        boxShadow: locked ? "none" : `0 4px 24px ${meta.glow}30`,
        background: `linear-gradient(160deg, ${meta.glow.replace("0.6","0.05")} 0%, transparent 60%)`,
      }}
    >
      {/* Top accent */}
      <div className={cn("h-1 w-full bg-gradient-to-r", meta.gradient)} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn("h-12 w-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br", meta.gradient)}
              style={{ boxShadow: locked ? "none" : `0 0 16px ${meta.glow}` }}
            >
              {meta.icon}
            </div>
            <div>
              <h3 className="font-bold text-foreground">{rate.name}</h3>
              <p className="text-[10px] text-muted-foreground">{meta.speed} Speed · {rate.duration_hours}h session</p>
            </div>
          </div>

          {locked ? (
            <div className="flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 border border-white/5">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">VIP {rate.min_vip}</span>
            </div>
          ) : (
            <div
              className="rounded-lg px-2 py-1 border text-xs font-bold"
              style={{ borderColor: meta.border, color: meta.particle, background: `${meta.glow.replace("0.6","0.15")}` }}
            >
              {(rate.daily_rate * 100).toFixed(1)}%/day
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Daily Profit",    value: noFunds || locked ? "—" : `$${dailyEarn.toFixed(4)}`   },
            { label: `Per ${rate.duration_hours}h Session`, value: noFunds || locked ? "—" : `$${sessionEarn.toFixed(4)}` },
            { label: "Speed",           value: `${meta.speed}`                                          },
            { label: "Min VIP",         value: rate.min_vip === 0 ? "Free" : `VIP ${rate.min_vip}`     },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-black/25 border border-white/5 p-2">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-xs font-semibold text-foreground mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Action */}
        {locked ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-black/30 py-3 border border-white/5">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Unlock with <strong>VIP {rate.min_vip}</strong></span>
          </div>
        ) : (
          <Button
            className="w-full h-11 font-semibold"
            disabled={!canStart}
            style={canStart ? {
              background: `linear-gradient(135deg, ${meta.glow.replace("0.6","0.8")}, ${meta.glow.replace("0.6","0.4")})`,
              boxShadow: `0 0 16px ${meta.glow.replace("0.6","0.3")}`,
              color: "#fff",
            } : {}}
            onClick={() => canStart && onStart(planId)}
          >
            {busy ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Starting...</>
            ) : isAnyActive ? (
              "Another Session Active"
            ) : noFunds ? (
              "Deposit USDT First"
            ) : (
              <><Zap className="h-4 w-4 mr-2" />Start Mining</>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Referral Boost Card ──────────────────────────────────────────────────────

function ReferralBoostCard({ telegramId, authHeaders }: { telegramId: string | null; authHeaders: HeadersInit }) {
  const [referrals, setReferrals] = useState(0)

  useEffect(() => {
    if (!telegramId) return
    fetch("/api/referrals", { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (!d.error) setReferrals(d.totalReferrals ?? 0) })
      .catch(() => {})
  }, [telegramId, authHeaders])

  const boost = referrals >= 50 ? 15 : referrals >= 20 ? 10 : referrals >= 10 ? 5 : referrals >= 5 ? 2 : 0
  const nextAt = referrals < 5 ? 5 : referrals < 10 ? 10 : referrals < 20 ? 20 : referrals < 50 ? 50 : 50
  const prog = Math.min((referrals / nextAt) * 100, 100)

  return (
    <div
      className="rounded-2xl border p-4 space-y-3 relative overflow-hidden"
      style={{ borderColor: "rgba(34,211,238,0.3)", background: "linear-gradient(135deg, rgba(34,211,238,0.05), transparent)" }}
    >
      <div className="absolute right-4 top-4 text-5xl opacity-5 pointer-events-none select-none">👥</div>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-cyan-400" />
        <span className="font-semibold text-foreground">Referral Boost</span>
        {boost > 0 && (
          <Badge className="bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-xs">+{boost}% Active</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Invite friends to boost your mining rate. You have <strong className="text-foreground">{referrals}</strong> referrals.
      </p>
      {boost === 0 ? (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{referrals} / {nextAt} referrals for +2% boost</span>
            <span>{prog.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-black/40 overflow-hidden">
            <div className="h-full rounded-full bg-cyan-500/70 transition-all duration-1000" style={{ width: `${prog}%` }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { at: 5,  pct: "+2%" },
            { at: 10, pct: "+5%" },
            { at: 20, pct: "+10%"},
            { at: 50, pct: "+15%"},
          ].map((tier) => (
            <div
              key={tier.at}
              className={cn(
                "rounded-lg py-2 text-center border text-xs font-bold",
                referrals >= tier.at
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                  : "bg-black/20 border-white/5 text-muted-foreground"
              )}
            >
              <p>{tier.pct}</p>
              <p className="text-[9px] font-normal mt-0.5">{tier.at} refs</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── History ──────────────────────────────────────────────────────────────────

function HistorySection({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/2 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Mining History</h3>
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-8">
          <Cpu className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No mining sessions yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Start your first session below</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const pid  = e.source.replace("mining:", "")
            const meta = PLAN_META[pid] ?? PLAN_META.basic
            return (
              <div key={e.id} className="flex items-center gap-3 rounded-xl bg-black/25 border border-white/5 p-3">
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center text-lg bg-gradient-to-br", meta.gradient)}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground capitalize">{pid} Mining</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="font-bold text-green-400 text-sm">+${e.amount.toFixed(4)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── VIP Banner ───────────────────────────────────────────────────────────────

function VipBanner({ vip, rates }: { vip: number; rates: Record<string, MiningRate> }) {
  if (vip >= 5) return null
  const nextVip  = vip + 1
  const nextPlan = Object.entries(rates).find(([, r]) => r.min_vip === nextVip)
  if (!nextPlan) return null
  const [pid, rate] = nextPlan
  const meta = PLAN_META[pid]

  return (
    <div
      className="rounded-2xl border p-4 relative overflow-hidden"
      style={{ borderColor: meta?.border, background: `${meta?.glow.replace("0.6","0.06")}` }}
    >
      <div className="absolute top-0 right-0 text-[80px] opacity-5 pointer-events-none leading-none">👑</div>
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-bold text-amber-400">Upgrade to VIP {nextVip}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Unlock <strong className="text-foreground">{rate.name}</strong> — earn{" "}
            <strong style={{ color: meta?.particle }}>{(rate.daily_rate * 100).toFixed(1)}% daily</strong>
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
          <ArrowUp className="h-3 w-3 text-amber-400" />
          <span>VIP {nextVip}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function MiningScreen() {
  const { user, wallet, telegramId, authHeaders, refreshWallet } = useUser()
  const [status, setStatus]     = useState<MiningStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isStarting, setIsStarting] = useState<string | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimDialog, setClaimDialog] = useState<{ open: boolean; earned?: number }>({ open: false })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const vipLevel = status?.vip_level ?? user?.vip_level ?? 0
  const balance  = status?.balance ?? wallet?.balance ?? 0

  const fetchStatus = useCallback(async () => {
    if (!telegramId) { setLoading(false); return }
    try {
      const res  = await fetch("/api/mining/status", { headers: authHeaders })
      const data = await res.json()
      if (!data.error) {
        setStatus(data)
        // Backend auto-completed an expired session → show reward dialog
        if (data.autoCompleted && data.lastEarned > 0) {
          setClaimDialog({ open: true, earned: data.lastEarned })
          refreshWallet()
        }
      }
    } catch {}
    setLoading(false)
  }, [telegramId, authHeaders, refreshWallet])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useEffect(() => {
    const id = setInterval(fetchStatus, 15_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const handleStart = async (planId: string) => {
    if (!telegramId || isStarting) return
    setIsStarting(planId)
    try {
      const res  = await fetch("/api/mining/start", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ plan_id: planId }),
      })
      const data = await res.json()
      if (data.success) await fetchStatus()
      else setErrorMsg(data.error ?? "Failed to start mining")
    } catch { setErrorMsg("Network error. Please try again.") }
    setIsStarting(null)
  }

  const handleClaim = async () => {
    if (!telegramId || isClaiming) return
    setIsClaiming(true)
    try {
      const res  = await fetch("/api/mining/claim", { method: "POST", headers: authHeaders })
      const data = await res.json()
      if (data.success) {
        setClaimDialog({ open: true, earned: data.earned })
        await Promise.all([fetchStatus(), refreshWallet()])
      } else setErrorMsg(data.error ?? "Failed to claim")
    } catch { setErrorMsg("Network error. Please try again.") }
    setIsClaiming(false)
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 safe-area-top">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-secondary/20 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    )
  }

  const rates   = status?.rates ?? {}
  const session = status?.session
  const history = status?.history ?? []
  const totalEarned = history.reduce((s, e) => s + e.amount, 0)
  const isAnyActive = !!session && session.end_time > Date.now()

  return (
    <div className="flex flex-col gap-4 p-4 pb-6 safe-area-top">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary animate-pulse" />
            Mining
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Earn USDT passively</p>
        </div>
        <button
          onClick={fetchStatus}
          className="p-2.5 rounded-xl bg-secondary/40 border border-white/5 hover:bg-secondary transition-colors"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── Balance + VIP hero ── */}
      <div
        className="rounded-2xl border border-primary/25 p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, oklch(0.13 0.05 290), oklch(0.11 0.03 310))",
          boxShadow: "0 0 40px oklch(0.70 0.18 290 / 0.15)",
        }}
      >
        {/* decorative blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, oklch(0.70 0.18 290), transparent)" }} />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, oklch(0.75 0.15 320), transparent)" }} />
        </div>

        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">USDT Balance</p>
            <p className="text-4xl font-bold mt-1"
              style={{ background: "linear-gradient(90deg,#c084fc,#818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              ${balance.toFixed(4)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Available to mine</p>
          </div>
          <div className="text-right">
            <div
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold border"
              style={{
                borderColor: VIP_COLORS[Math.min(vipLevel, 5)] + "60",
                background: VIP_COLORS[Math.min(vipLevel, 5)] + "20",
                color: VIP_COLORS[Math.min(vipLevel, 5)],
              }}
            >
              <Crown className="h-3.5 w-3.5" />
              VIP {vipLevel} — {VIP_LABELS[Math.min(vipLevel, 5)]}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {(rates[PLAN_ORDER[Math.min(vipLevel, PLAN_ORDER.length - 1)]]?.daily_rate * 100 || 1).toFixed(1)}% daily rate
            </p>
          </div>
        </div>

        {/* Total earned row */}
        <div className="mt-4 flex gap-3">
          <div className="flex-1 rounded-xl bg-black/30 border border-white/5 p-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Total Mined</p>
              <p className="text-sm font-bold text-green-400">+${totalEarned.toFixed(4)}</p>
            </div>
          </div>
          <div className="flex-1 rounded-xl bg-black/30 border border-white/5 p-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Sessions</p>
              <p className="text-sm font-bold text-foreground">{history.length}</p>
            </div>
          </div>
          <div className="flex-1 rounded-xl bg-black/30 border border-white/5 p-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">VIP Bonus</p>
              <p className="text-sm font-bold text-amber-400">+{vipLevel * 10}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active session ── */}
      {session && session.end_time > Date.now() && (
        <ActiveSessionCard session={session} onClaim={handleClaim} isClaiming={isClaiming} />
      )}

      {/* ── Plan cards ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Mining Plans</h2>
          {balance <= 0 && (
            <Badge className="ml-auto text-xs bg-amber-500/20 border border-amber-500/50 text-amber-300">
              Deposit USDT to start
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          {PLAN_ORDER.map((pid) => {
            const rate = rates[pid]
            if (!rate) return null
            return (
              <PlanCard
                key={pid}
                planId={pid}
                rate={rate}
                vipLevel={vipLevel}
                isAnyActive={isAnyActive}
                onStart={handleStart}
                isStarting={isStarting}
                balance={balance}
              />
            )
          })}
        </div>
      </div>

      {/* ── Referral boost ── */}
      <ReferralBoostCard telegramId={telegramId} authHeaders={authHeaders} />

      {/* ── VIP upgrade banner ── */}
      <VipBanner vip={vipLevel} rates={rates} />

      {/* ── History ── */}
      <HistorySection entries={history} />

      {/* ── Claim success dialog ── */}
      <Dialog open={claimDialog.open} onOpenChange={(o) => setClaimDialog({ open: o })}>
        <DialogContent className="glass-card border-green-500/30 text-center">
          <DialogHeader className="sr-only">
            <DialogTitle>Reward Claimed</DialogTitle>
            <DialogDescription>Mining reward successfully claimed</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-6 gap-4">
            <div className="h-20 w-20 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Reward Claimed!</h2>
              <p className="text-4xl font-bold text-green-400 mt-2">
                +${(claimDialog.earned ?? 0).toFixed(6)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">USDT added to your balance</p>
            </div>
            <Button
              className="w-full"
              style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff" }}
              onClick={() => setClaimDialog({ open: false })}
            >
              Continue Mining
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Error dialog ── */}
      <Dialog open={!!errorMsg} onOpenChange={(o) => { if (!o) setErrorMsg(null) }}>
        <DialogContent className="glass-card border-destructive/30">
          <DialogHeader>
            <DialogTitle className="text-foreground">Error</DialogTitle>
            <DialogDescription>{errorMsg}</DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setErrorMsg(null)} className="w-full">Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
