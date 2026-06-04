"use client"
import { useState, useEffect, useCallback } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Copy, Check, X, Clock, ChevronRight, RefreshCw, WifiOff, Wallet, History, TrendingUp, Award, Sparkles } from "lucide-react"
import { useUser } from "@/context/user-context"
import { useRealtimeTransactions, type LiveTransaction } from "@/hooks/use-realtime-transactions"
type Tab = "all" | "earnings" | "withdrawals" | "bonuses"
type DepositStep = "choose_network" | "waiting_payment" | "done"
type Network = "tron" | "eth" | "bsc"
interface Transaction { id: string; type: string; amount: number; status: string; source?: string; address?: string; created_at: string }
interface DepositInfo { mode: "nowpayments" | "static"; payment_id?: string; payment_address: string; pay_amount?: number; pay_currency?: string; expiry?: string | null; transaction_id?: string }
interface ConfiguredAddresses { tron: string; eth: string; bsc: string }

function AnimatedNumber({ value, prefix = "", decimals = 2 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const duration = 800; const start = display; const diff = value - start; const startTime = Date.now()
    const animate = () => { const elapsed = Date.now() - startTime; const progress = Math.min(elapsed / duration, 1); const eased = 1 - Math.pow(1 - progress, 3); setDisplay(start + diff * eased); if (progress < 1) requestAnimationFrame(animate) }
    requestAnimationFrame(animate)
  }, [value])
  return <span>{prefix}{display.toFixed(decimals)}</span>
}

export function WalletScreen({ initialAction, onActionHandled }: { initialAction?: "deposit" | "withdraw" | null; onActionHandled?: () => void }) {
  const { wallet, user, telegramId, authHeaders, refreshWallet } = useUser()
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTx, setLoadingTx] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [configuredAddrs, setConfiguredAddrs] = useState<ConfiguredAddresses>({ tron: "", eth: "", bsc: "" })
  const [showDeposit, setShowDeposit] = useState(false)
  const [depositStep, setDepositStep] = useState<DepositStep>("choose_network")
  const [selectedNetwork, setSelectedNetwork] = useState<Network>("tron")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [depositLoading, setDepositLoading] = useState(false)
  const [depositError, setDepositError] = useState("")
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [nextCheck, setNextCheck] = useState<number>(30)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawAddress, setWithdrawAddress] = useState("")
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawError, setWithdrawError] = useState("")
  const [withdrawSuccess, setWithdrawSuccess] = useState(false)

  const { isLive } = useRealtimeTransactions(user?.id ?? null, {
    onNew: (tx: LiveTransaction) => { setTransactions(prev => { if (prev.some(t => t.id === tx.id)) return prev; setFlashId(tx.id); setTimeout(() => setFlashId(null), 2000); return [tx as Transaction, ...prev] }) },
    onUpdate: (txId: string, status: string) => { setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status } : t)) },
  })

  useEffect(() => { if (initialAction === "deposit") { setShowDeposit(true); onActionHandled?.() } else if (initialAction === "withdraw") { setShowWithdraw(true); onActionHandled?.() } }, [initialAction, onActionHandled])
  useEffect(() => { if (depositStep !== "waiting_payment" || !depositInfo?.expiry) { setCountdown(null); return }; const expiry = new Date(depositInfo.expiry).getTime(); const tick = () => { const secs = Math.max(0, Math.floor((expiry - Date.now()) / 1000)); setCountdown(secs) }; tick(); const id = setInterval(tick, 1000); return () => clearInterval(id) }, [depositStep, depositInfo?.expiry])
  useEffect(() => { if (depositStep !== "waiting_payment" || !depositInfo) return; if (countdown === 0) return; setNextCheck(30); const ticker = setInterval(() => { setNextCheck(prev => prev <= 1 ? 30 : prev - 1) }, 1000); const checker = setInterval(async () => { if (!depositInfo?.transaction_id) return setNextCheck(30); try { const res = await fetch("/api/verify-deposits", { method: "POST", headers: authHeaders as HeadersInit, body: JSON.stringify({ transaction_id: depositInfo.transaction_id }) }); const data = await res.json(); if (data.status === "completed") { setDepositStep("done"); await refreshWallet(); fetchTransactions() } } catch { } }, 30000); return () => { clearInterval(ticker); clearInterval(checker) } }, [depositStep, depositInfo?.transaction_id, countdown === 0])

  const fetchTransactions = useCallback(async () => { if (!telegramId) return; setLoadingTx(true); try { const res = await fetch("/api/wallet/balance", { headers: authHeaders as HeadersInit, cache: "no-store" }); const data = await res.json(); if (data.transactions) setTransactions(data.transactions) } catch { } finally { setLoadingTx(false) } }, [telegramId, authHeaders])
  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => { if (!telegramId) return; fetch("/api/wallet/deposit", { headers: authHeaders as HeadersInit, cache: "no-store" }).then(r => r.json()).then(d => { if (d.addresses) setConfiguredAddrs(d.addresses) }).catch(() => { }) }, [telegramId, authHeaders])

  const handleRefresh = async () => { setIsRefreshing(true); await Promise.all([refreshWallet(), fetchTransactions()]); setIsRefreshing(false) }
  const displayAddress = configuredAddrs.tron || ""
  const copyDisplayAddress = () => { if (!displayAddress) return; navigator.clipboard.writeText(displayAddress).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  const copyDepositAddr = (addr: string) => { navigator.clipboard.writeText(addr).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000) }) }

  const filteredTransactions = transactions.filter((tx) => {
    if (activeTab === "all") return true
    if (activeTab === "earnings") return ["earning", "reward", "referral", "deposit", "mining", "spin", "daily_bonus", "admin_credit"].includes(tx.type) && Number(tx.amount) > 0
    if (activeTab === "withdrawals") return tx.type === "withdrawal"
    if (activeTab === "bonuses") return ["bonus", "spin", "referral_bonus", "referral", "daily_bonus"].includes(tx.type)
    return true
  })

  const handleCreateDeposit = async () => {
    const amt = parseFloat(depositAmount)
    if (isNaN(amt) || amt < 5) { setDepositError("Minimum deposit is $5"); return }
    setDepositLoading(true); setDepositError("")
    try {
      const res = await fetch("/api/wallet/deposit/create", { method: "POST", headers: authHeaders as HeadersInit, body: JSON.stringify({ amount: amt, network: selectedNetwork }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create deposit")
      setDepositInfo(data); setDepositStep("waiting_payment")
    } catch (e: unknown) { setDepositError((e as Error).message) } finally { setDepositLoading(false) }
  }

  const closeDeposit = () => { setShowDeposit(false); setDepositStep("choose_network"); setDepositAmount(""); setDepositInfo(null); setDepositError(""); setCopiedAddr(false) }

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount)
    if (isNaN(amt) || amt <= 0) { setWithdrawError("Enter a valid amount"); return }
    if (!withdrawAddress.trim()) { setWithdrawError("Enter your wallet address"); return }
    if (wallet && amt > Number(wallet.balance)) { setWithdrawError("Insufficient balance"); return }
    setWithdrawLoading(true); setWithdrawError("")
    try {
      const res = await fetch("/api/wallet/withdraw", { method: "POST", headers: authHeaders as HeadersInit, body: JSON.stringify({ amount: amt, address: withdrawAddress }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Withdrawal failed")
      setWithdrawSuccess(true); await refreshWallet(); fetchTransactions()
    } catch (e: unknown) { setWithdrawError((e as Error).message) } finally { setWithdrawLoading(false) }
  }

  const closeWithdraw = () => { setShowWithdraw(false); setWithdrawAmount(""); setWithdrawAddress(""); setWithdrawError(""); setWithdrawSuccess(false) }

  const formatDate = (dateStr: string) => { const d = new Date(dateStr); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }

  const txLabel = (tx: Transaction) => {
    const labels: Record<string, string> = { deposit: "Deposit", withdrawal: "Withdrawal", earning: "Video Earning", referral: "Referral Bonus", bonus: "Bonus", spin: "Lucky Spin", mining: "Mining Reward", daily_bonus: "Daily Bonus", admin_credit: "Admin Credit", vip_upgrade: "VIP Upgrade" }
    return labels[tx.type] || tx.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  }

  const statusBadge = (status: string) => {
    if (["completed", "approved"].includes(status)) return <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">Confirmed</span>
    if (status === "pending") return <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">Pending</span>
    if (["failed", "rejected"].includes(status)) return <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">Failed</span>
    return null
  }

  const balance = wallet ? Number(wallet.balance) : 0
  const totalEarned = wallet ? Number(wallet.total_earned) : 0
  const totalWithdrawn = wallet ? Number(wallet.total_withdrawn) : 0
  const coins = wallet ? Number(wallet.coins) : 0

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 animate-in fade-in duration-500">

      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/30">
          <Wallet className="h-6 w-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-white">Wallet</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1"><Sparkles className="h-3 w-3 text-purple-400" />Your balance & transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${isLive ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-white/5 text-gray-500 border border-white/5"}`}>
            {isLive ? <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>Live</> : <><WifiOff size={10} />Offline</>}
          </div>
          <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <RefreshCw size={16} className={isRefreshing ? "animate-spin text-purple-400" : "text-gray-400"} />
          </button>
        </div>
      </div>

      {/* ═══════ BALANCE CARD ═══════ */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10"
        style={{ background: "linear-gradient(135deg, rgba(88,28,255,0.1), rgba(147,51,234,0.08), rgba(219,39,119,0.05))", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/20 rounded-full blur-3xl -ml-16 -mb-16" />
        <div className="relative z-10 flex flex-col items-center py-10 px-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-4">
            <Wallet className="h-4 w-4 text-purple-400" />
            <p className="text-sm text-gray-300">Available Balance</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tight"><AnimatedNumber value={balance} prefix="$" /></h1>
          <p className="text-sm text-gray-400 mt-1">USDT</p>
          <div className="flex gap-3 mt-6 w-full">
            <button onClick={() => setShowDeposit(true)} className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 active:scale-95 transition-all py-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-white shadow-lg shadow-purple-900/40">
              <ArrowDownToLine size={18} />Deposit
            </button>
            <button onClick={() => setShowWithdraw(true)} className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 active:scale-95 transition-all py-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-white shadow-lg shadow-orange-900/40">
              <ArrowUpFromLine size={18} />Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* ═══════ TRC20 ADDRESS ═══════ */}
      {displayAddress && (
        <div className="rounded-2xl border border-white/10 p-4"
          style={{ background: "rgba(255,255,255,0.02)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <p className="text-sm text-gray-400 mb-3 flex items-center gap-1">🏦 Your TRC20 Deposit Address</p>
          <div className="flex items-center gap-2 bg-black/40 rounded-xl p-2 border border-white/5">
            <p className="flex-1 text-xs text-gray-300 truncate font-mono px-1">{displayAddress}</p>
            <button onClick={copyDisplayAddress} className="p-2 bg-white/10 rounded-lg active:scale-90 transition-transform flex-shrink-0">
              {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} className="text-gray-300" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">⚠️ Only send USDT (TRC20) to this address.</p>
        </div>
      )}

      {/* ═══════ STATS ═══════ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: TrendingUp, label: "Total Earned", value: `$${totalEarned.toFixed(2)}`, gradient: "from-green-500/20 to-emerald-500/10", border: "border-green-500/30", iconColor: "text-green-400", textColor: "text-green-400" },
          { icon: ArrowUpFromLine, label: "Withdrawn", value: `$${totalWithdrawn.toFixed(2)}`, gradient: "from-orange-500/20 to-amber-500/10", border: "border-orange-500/30", iconColor: "text-orange-400", textColor: "text-white" },
          { icon: Award, label: "Coins", value: String(coins), gradient: "from-purple-500/20 to-pink-500/10", border: "border-purple-500/30", iconColor: "text-purple-400", textColor: "text-purple-400" },
        ].map(({ icon: Icon, label, value, gradient, border, iconColor, textColor }) => (
          <div key={label} className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-105 transition-transform`}
            style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
            <div className="p-1.5 rounded-lg bg-white/10"><Icon className={`h-4 w-4 ${iconColor}`} /></div>
            <p className={`text-lg font-black ${textColor}`}>{value}</p>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══════ TRANSACTION HISTORY ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden flex-1"
        style={{ background: "rgba(255,255,255,0.02)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-white flex items-center gap-2"><History size={16} />History</p>
            {isLive && <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">Auto-updating</span>}
          </div>
          <div className="flex gap-1 bg-black/30 rounded-xl p-1 mb-4">
            {(["all", "earnings", "withdrawals", "bonuses"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-1.5 text-xs rounded-lg capitalize transition-all ${activeTab === t ? "bg-purple-600 text-white font-semibold" : "text-gray-400 hover:text-gray-200"}`}>{t}</button>
            ))}
          </div>
          {loadingTx ? (
            <div className="text-center py-10"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-10 text-gray-500"><Clock className="mx-auto mb-3 opacity-40" size={32} /><p className="text-sm">No transactions yet</p></div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className={`flex items-center gap-3 py-2 border-b border-white/5 last:border-0 transition-colors duration-700 ${flashId === tx.id ? "bg-green-500/10 rounded-lg px-1" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${Number(tx.amount) > 0 ? "bg-green-500/20" : "bg-red-500/20"}`}>
                    {Number(tx.amount) > 0 ? <ArrowDownToLine size={14} className="text-green-400" /> : <ArrowUpFromLine size={14} className="text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{txLabel(tx)}</p>
                    <div className="flex items-center gap-2 mt-0.5"><p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>{statusBadge(tx.status)}</div>
                  </div>
                  <p className={`font-semibold text-sm flex-shrink-0 ${Number(tx.amount) > 0 ? "text-green-400" : "text-gray-200"}`}>
                    {Number(tx.amount) > 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ DEPOSIT MODAL ═══════ */}
      {showDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={(e) => { if (e.target === e.currentTarget) closeDeposit() }}>
          <div className="border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col" style={{ height: "auto", maxHeight: "90vh", background: "rgba(15,15,35,0.95)", backdropFilter: "blur(20px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">{depositStep === "choose_network" ? "Deposit USDT" : depositStep === "waiting_payment" ? "Send Payment" : "Deposit Confirmed!"}</h2>
              <button onClick={closeDeposit} className="p-2 rounded-lg bg-white/10 active:scale-90 transition-all"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {depositStep === "choose_network" && (
                <>
                  <div>
                    <p className="text-sm text-gray-400 mb-3 font-medium">Select Network</p>
                    <div className="grid grid-cols-3 gap-3">
                      {(["tron", "eth", "bsc"] as Network[]).map((net) => (
                        <button key={net} onClick={() => setSelectedNetwork(net)} className={`py-3 rounded-xl text-center transition-all ${selectedNetwork === net ? "bg-purple-600 border border-purple-400 shadow-lg shadow-purple-900/40" : "bg-white/5 border border-white/10 hover:bg-white/10"}`}>
                          <p className="font-bold text-sm text-white">{net === "tron" ? "TRC20" : net === "eth" ? "ERC20" : "BEP20"}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{net === "tron" ? "Tron" : net === "eth" ? "Ethereum" : "BSC"}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-3 font-medium">Amount (USD)</p>
                    <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-4 py-1">
                      <span className="text-gray-400 text-lg mr-2">$</span>
                      <input type="number" min={5} step={1} placeholder="Enter amount..." value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="flex-1 bg-transparent py-3 text-white text-lg outline-none placeholder:text-gray-600" />
                      <span className="text-gray-500 text-sm ml-2">USDT</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">💰 Minimum deposit: $5.00</p>
                  </div>
                  {depositError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"><p className="text-red-400 text-sm text-center">{depositError}</p></div>}
                </>
              )}
              {depositStep === "waiting_payment" && depositInfo && (
                <>
                  <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-purple-500/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">🔒 Send exactly</p>
                    <p className="text-2xl font-bold text-purple-300">{depositInfo.pay_amount?.toFixed(6) ?? `$${depositAmount}`}</p>
                    <p className="text-sm text-gray-300 mt-1">{depositInfo.pay_currency?.toUpperCase() ?? "USDT"}</p>
                    <p className="text-xs text-gray-500 mt-1">Via {selectedNetwork === "tron" ? "TRC20 (Tron)" : selectedNetwork === "eth" ? "ERC20 (Ethereum)" : "BEP20 (BSC)"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-2">📍 To this address</p>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl p-3">
                      <p className="flex-1 text-xs font-mono text-gray-200 break-all">{depositInfo.payment_address}</p>
                      <button onClick={() => copyDepositAddr(depositInfo!.payment_address)} className="p-2 bg-white/10 rounded-lg active:scale-90 transition-all flex-shrink-0">
                        {copiedAddr ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-gray-300" />}
                      </button>
                    </div>
                  </div>
                  {depositInfo.expiry && countdown !== null && (
                    <div className={`flex items-center justify-between rounded-xl p-3 border ${countdown === 0 ? "bg-red-500/10 border-red-500/30" : countdown < 120 ? "bg-orange-500/10 border-orange-500/30" : "bg-yellow-500/10 border-yellow-500/30"}`}>
                      <div className="flex items-center gap-2"><span className="text-sm">🔑</span><p className="text-xs font-medium text-white">{countdown === 0 ? "Address expired" : "Address expires in"}</p></div>
                      {countdown > 0 && <span className="font-mono font-bold text-sm text-white">{String(Math.floor(countdown / 60)).padStart(2, "0")}:{String(countdown % 60).padStart(2, "0")}</span>}
                    </div>
                  )}
                  <div className="bg-purple-900/20 border border-purple-900/30 rounded-xl p-3">
                    <p className="text-xs text-gray-400 text-center">📝 Your deposit will be automatically verified within 1–30 minutes.</p>
                  </div>
                </>
              )}
              {depositStep === "done" && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center animate-bounce"><Check size={40} className="text-green-400" /></div>
                  <div className="text-center"><p className="text-xl font-bold text-green-400">Deposit Confirmed! 🎉</p><p className="text-gray-400 text-sm mt-1">Your balance has been updated.</p></div>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-5 py-4 border-t border-white/10">
              {depositStep === "choose_network" && (
                <button onClick={handleCreateDeposit} disabled={depositLoading || !depositAmount || parseFloat(depositAmount) < 5} className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:opacity-50 py-3.5 rounded-xl font-semibold text-white shadow-lg shadow-purple-900/40">
                  {depositLoading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <>Continue to Payment <ChevronRight size={18} /></>}
                </button>
              )}
              {depositStep === "waiting_payment" && (
                <div className="flex flex-col gap-2">
                  {countdown !== 0 && (
                    <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-400">🔗 Auto-checking every 30s</span>
                      <span className="text-xs font-mono text-purple-400 tabular-nums">{String(nextCheck).padStart(2, "0")}s</span>
                    </div>
                  )}
                  <button onClick={closeDeposit} className="w-full bg-white/10 hover:bg-white/20 py-3.5 rounded-xl text-sm font-medium text-white">Close</button>
                </div>
              )}
              {depositStep === "done" && (
                <button onClick={closeDeposit} className="w-full bg-gradient-to-r from-purple-600 to-purple-700 py-3.5 rounded-xl font-semibold text-white">Done</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ WITHDRAW MODAL ═══════ */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={(e) => { if (e.target === e.currentTarget) closeWithdraw() }}>
          <div className="border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl" style={{ background: "rgba(15,15,35,0.95)", backdropFilter: "blur(20px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-bold text-white">Withdraw USDT</h2><button onClick={closeWithdraw} className="p-2 rounded-lg bg-white/10 active:scale-90"><X size={18} className="text-gray-400" /></button></div>
            {withdrawSuccess ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center animate-bounce"><Check size={32} className="text-green-400" /></div>
                <div className="text-center"><p className="text-lg font-bold text-green-400">Request Submitted! ✅</p><p className="text-gray-400 text-sm mt-1">Your withdrawal is pending admin approval.</p></div>
                <button onClick={closeWithdraw} className="w-full bg-gradient-to-r from-purple-600 to-purple-700 py-3 rounded-xl font-semibold text-white">Done</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-3 flex items-center justify-between border border-purple-500/20">
                  <p className="text-xs text-gray-400">💰 Available Balance</p>
                  <p className="text-sm font-bold text-purple-300">${balance.toFixed(2)} USDT</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">Amount (USD)</p>
                  <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-3">
                    <span className="text-gray-500 mr-2">$</span>
                    <input type="number" min={0} placeholder="Enter amount..." value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="flex-1 bg-transparent py-3 text-white outline-none placeholder:text-gray-600" />
                    <button onClick={() => setWithdrawAmount(String(balance))} className="text-xs text-purple-400 px-2 font-semibold hover:text-purple-300">MAX</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">📎 USDT Wallet Address (TRC20)</p>
                  <input type="text" placeholder="Enter your TRC20 wallet address..." value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white outline-none placeholder:text-gray-600 text-sm" />
                </div>
                {withdrawError && <p className="text-red-400 text-xs bg-red-500/10 p-2 rounded-lg">{withdrawError}</p>}
                <button onClick={handleWithdraw} disabled={withdrawLoading} className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2">
                  {withdrawLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <><ArrowUpFromLine size={18} />Submit Withdrawal</>}
                </button>
                <p className="text-xs text-gray-500 text-center">⏱️ Withdrawals are reviewed within 24 hours.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletScreen
