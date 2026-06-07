"use client";

import { useState, useEffect, useCallback } from "react"
import { Gift } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useUser } from "@/context/user-context"

// ─── Constants ────────────────────────────────────────────────────────────────

const SPIN_PRIZES = ["$0.10", "$0.50", "$1.00", "$0.25", "$0.20", "$0.05", "$2.00", "$0.15"]

// ─── EarnScreen ───────────────────────────────────────────────────────────────

export function EarnScreen() {
  const { telegramId, authHeaders, refreshWallet } = useUser()

  // ── Spin ──────────────────────────────────────────────────────────────────
  const [spinning,        setSpinning]        = useState(false)
  const [rotation,        setRotation]        = useState(0)
  const [spinsRemaining,  setSpinsRemaining]  = useState<number | null>(null)
  const [spinLoading,     setSpinLoading]     = useState(true)
  const [wonPrize,        setWonPrize]        = useState<string | null>(null)
  const [showPrizeDialog, setShowPrizeDialog] = useState(false)
  const [winningIdx,      setWinningIdx]      = useState<number | null>(null)
  const [glowFlash,       setGlowFlash]       = useState(false)

  // ─── Fetchers ──────────────────────────────────────────────────────────────

  const fetchSpinStatus = useCallback(async () => {
    if (!telegramId) { setSpinLoading(false); setSpinsRemaining(3); return }
    setSpinLoading(true)
    try {
      const res  = await fetch("/api/rewards/spin/status", { headers: authHeaders })
      const data = await res.json()
      if (typeof data.spinsRemaining === "number") setSpinsRemaining(data.spinsRemaining)
    } catch { setSpinsRemaining(3) }
    setSpinLoading(false)
  }, [telegramId, authHeaders])

  useEffect(() => { fetchSpinStatus() }, [fetchSpinStatus])

  // ─── Spin handlers ────────────────────────────────────────────────────────

  const calcTarget = (cur: number, idx: number) => {
    const mid = Math.random() * 30 + 7.5
    const desired = (idx * 45 + mid) % 360
    const curMod  = ((cur % 360) + 360) % 360
    return cur + 1800 + ((360 - desired - curMod + 360 * 2) % 360)
  }

  const revealWin = (idx: number, prize: string, doRefresh = false) => {
    setSpinning(false); setWinningIdx(idx)
    let n = 0
    const t = setInterval(() => {
      setGlowFlash(f => !f); n++
      if (n >= 6) {
        clearInterval(t); setGlowFlash(true)
        setWonPrize(prize); setShowPrizeDialog(true)
        if (doRefresh) refreshWallet()
      }
    }, 160)
  }

  const handleSpin = async () => {
    if (spinning || spinsRemaining === null || spinsRemaining <= 0) return
    setSpinning(true); setWinningIdx(null); setGlowFlash(false)
    if (telegramId) {
      try {
        const res  = await fetch("/api/rewards/spin", { method: "POST", headers: authHeaders })
        const data = await res.json()
        if (data.success) {
          const idx = typeof data.prizeIndex === "number" ? data.prizeIndex : Math.floor(Math.random() * 8)
          setRotation(calcTarget(rotation, idx))
          setSpinsRemaining(typeof data.spinsRemaining === "number" ? data.spinsRemaining : (spinsRemaining ?? 1) - 1)
          const pv = typeof data.prize === "number" ? data.prize : Number(data.prize)
          setTimeout(() => revealWin(idx, !isNaN(pv) ? `$${pv.toFixed(2)}` : SPIN_PRIZES[idx], true), 4000)
          return
        }
        if (typeof data.spinsRemaining === "number") setSpinsRemaining(data.spinsRemaining)
        setSpinning(false); return
      } catch {}
    }
    const idx = Math.floor(Math.random() * 8)
    setRotation(calcTarget(rotation, idx))
    setSpinsRemaining(prev => Math.max(0, (prev ?? 1) - 1))
    setTimeout(() => revealWin(idx, SPIN_PRIZES[idx], false), 4000)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 safe-area-top">
      <h1 className="text-2xl font-bold text-foreground">Earn Rewards</h1>

      {/* ══ Spin Wheel ════════════════════════════════════════════════════════ */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="flex flex-col items-center p-6">
          <h2 className="text-xl font-bold text-foreground mb-2">Lucky Wheel</h2>
          <p className="text-sm text-muted-foreground mb-6">Spin to win up to $10 USDT!</p>
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-amber-500/30 via-yellow-400/20 to-amber-500/30 blur-xl animate-pulse" />
            <div className="absolute -inset-4 rounded-full border-4 border-amber-400/50"
              style={{ boxShadow: "0 0 20px rgba(251,191,36,.4),inset 0 0 20px rgba(251,191,36,.1)" }}>
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i}
                  className={cn("absolute w-2.5 h-2.5 rounded-full",
                    spinning
                      ? i % 2 === 0 ? "bg-yellow-300 shadow-[0_0_8px_rgba(253,224,71,.9)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,.9)]"
                      : "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,.8)]")}
                  style={{ left: "50%", top: "50%", transform: `rotate(${i * 22.5}deg) translateY(-140px) translateX(-50%)` }} />
              ))}
            </div>
            <div className="relative h-64 w-64 rounded-full transition-transform ease-out"
              style={{
                transform: `rotate(${rotation}deg)`,
                transitionDuration: spinning ? "4000ms" : "0ms",
                transitionTimingFunction: "cubic-bezier(.17,.67,.12,.99)",
                boxShadow: "0 0 0 6px #1a1a2e,0 0 0 8px rgba(251,191,36,.6),0 0 30px rgba(251,191,36,.3),inset 0 0 30px rgba(0,0,0,.3)",
              }}>
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                <defs>
                  <filter id="win-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {SPIN_PRIZES.map((prize, i) => {
                  const colors = [
                    { bg: "#f43f5e", text: "#fff" }, { bg: "#1e1e32", text: "#fbbf24" },
                    { bg: "#10b981", text: "#fff" }, { bg: "#1e1e32", text: "#fbbf24" },
                    { bg: "#f59e0b", text: "#fff" }, { bg: "#1e1e32", text: "#fbbf24" },
                    { bg: "#8b5cf6", text: "#fff" }, { bg: "#1e1e32", text: "#fbbf24" },
                  ]
                  const isWinner = winningIdx === i
                  const a = i * 45, s = (a - 90) * Math.PI / 180, e = (a + 45 - 90) * Math.PI / 180
                  const x1 = 100 + 100 * Math.cos(s), y1 = 100 + 100 * Math.sin(s)
                  const x2 = 100 + 100 * Math.cos(e), y2 = 100 + 100 * Math.sin(e)
                  const ta = a + 22.5
                  const tx = 100 + 65 * Math.cos((ta - 90) * Math.PI / 180)
                  const ty = 100 + 65 * Math.sin((ta - 90) * Math.PI / 180)
                  return (
                    <g key={i} filter={isWinner && glowFlash ? "url(#win-glow)" : undefined}>
                      <path
                        d={`M100,100 L${x1},${y1} A100,100 0 0,1 ${x2},${y2} Z`}
                        fill={isWinner && glowFlash ? "#ffffff" : colors[i].bg}
                        stroke={isWinner ? "#fbbf24" : "#2a2a4a"} strokeWidth={isWinner ? "2.5" : "1"}
                        opacity={isWinner && !glowFlash ? 0.6 : 1}
                      />
                      <text x={tx} y={ty}
                        fill={isWinner && glowFlash ? "#1a1a2e" : colors[i].text}
                        fontSize={isWinner ? "13" : "12"} fontWeight="bold"
                        textAnchor="middle" dominantBaseline="middle"
                        transform={`rotate(${ta},${tx},${ty})`}>{prize}</text>
                    </g>
                  )
                })}
              </svg>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 flex items-center justify-center"
                style={{ boxShadow: "0 4px 15px rgba(251,191,36,.5)" }}>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center">
                  <span className="text-amber-900 font-bold text-xs">SPIN</span>
                </div>
              </div>
            </div>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-20">
              <div className="w-0 h-0"
                style={{ borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: "28px solid #fbbf24", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))" }} />
            </div>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-5 w-5 text-amber-400" />
            {spinLoading ? <Skeleton className="h-4 w-36" /> : (
              <span className="text-sm text-muted-foreground">{spinsRemaining ?? 0} spins remaining today</span>
            )}
          </div>
          <Button
            onClick={handleSpin}
            disabled={spinning || spinLoading || (spinsRemaining ?? 0) <= 0}
            className="h-12 w-full text-lg font-semibold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:via-yellow-600 hover:to-amber-600 text-amber-950 shadow-lg shadow-amber-500/30"
          >
            {spinning ? "Spinning..." : (spinsRemaining ?? 0) <= 0 ? "No Spins Left" : "Spin Now"}
          </Button>
        </CardContent>
      </Card>

      {/* ══ Prize Won Dialog ═════════════════════════════════════════════════ */}
      <Dialog open={showPrizeDialog} onOpenChange={setShowPrizeDialog}>
        <DialogContent className="glass-card border-primary/20 p-0 max-w-sm overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>You Won!</DialogTitle>
            <DialogDescription>Your spin prize</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-14 px-6"
            style={{ background: "linear-gradient(180deg,oklch(0.20 0.12 60/0.4),transparent)" }}>
            <div className="h-20 w-20 rounded-full bg-amber-500/20 flex items-center justify-center mb-4 animate-in zoom-in duration-300">
              <Gift className="h-12 w-12 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white mb-1">You Won!</p>
            <p className="text-3xl font-black text-amber-400">{wonPrize} USDT</p>
            <p className="text-xs text-muted-foreground mt-3">Added to your wallet</p>
            <Button className="mt-6 w-full" onClick={() => setShowPrizeDialog(false)}>
              Awesome!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
