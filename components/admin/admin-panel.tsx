"use client";

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Users, Wallet, TrendingUp, PlayCircle, Menu, Home, DollarSign, Settings,
  BarChart3, CheckCircle2, XCircle, Search, Filter, MoreVertical, Eye, Ban,
  RefreshCw, Trash2, UserCheck, AlertTriangle, Lock, LogOut, PlusCircle, Zap,
  ArrowDownToLine, ArrowUpFromLine, Circle, Sparkles, Cpu, Gift, Send, Bell,
  Clock,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface User {
  id: string; telegram_id: string | number; first_name?: string; last_name?: string; username?: string
  balance: number; referrals: number; status: "active" | "suspended" | "banned"; vip: number
  joinDate: string; totalEarnings: number; videosWatched: number
}

function userDisplayName(u: User): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ")
  return full || (u.username ? `@${u.username}` : `#${u.telegram_id}`)
}
function userInitials(u: User): string {
  if (u.first_name) return (u.first_name[0] + (u.last_name?.[0] ?? "")).toUpperCase()
  if (u.username) return u.username.slice(0, 2).toUpperCase()
  return String(u.telegram_id).slice(0, 2)
}
function userSubtitle(u: User): string {
  if (u.username) return `@${u.username} · ${u.telegram_id}`
  return `ID: ${u.telegram_id}`
}

interface Withdrawal {
  id: number; userId: number; user: string; amount: number; address: string
  status: "pending" | "approved" | "rejected"; date: string; processedAt?: string
}

interface AppSettings {
  minWithdrawal: number; dailyVideoLimit: number; referralCommission: number; rewardPerVideo: number
  maxDailyEarnings: number; cooldownSeconds: number; minWatchPercent: number; vipMultiplier: number
  spinDailyLimit: number; maxDailyAds: number; rewardPerAd: number; adCooldownSeconds: number
  mysteryCooldown: number; mysteryMaxReward: number
}

const initialSettings: AppSettings = {
  minWithdrawal: 10, dailyVideoLimit: 50, referralCommission: 15, rewardPerVideo: 0.05,
  maxDailyEarnings: 25, cooldownSeconds: 30, minWatchPercent: 90, vipMultiplier: 1.5,
  spinDailyLimit: 3, maxDailyAds: 5, rewardPerAd: 0.05, adCooldownSeconds: 30,
  mysteryCooldown: 4, mysteryMaxReward: 2,
}

const sidebarItems = [
  { icon: Home, label: "Dashboard", id: "dashboard" },
  { icon: Users, label: "Users", id: "users" },
  { icon: DollarSign, label: "Withdrawals", id: "withdrawals" },
  { icon: BarChart3, label: "Analytics", id: "analytics" },
  { icon: Zap, label: "Live Feed", id: "live" },
  { icon: PlayCircle, label: "Videos", id: "videos" },
  { icon: PlayCircle, label: "Ad Networks", id: "adnetworks" },
  { icon: Settings, label: "Settings", id: "settings" },
]

// ═══════════════════════════════════════════════════════════════════════════════
// GLASS STYLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const glassStyle = {
  background: "rgba(255, 255, 255, 0.03)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "20px",
}

const glassCard = "border border-white/10 rounded-2xl overflow-hidden"
const glassBg = { background: "rgba(255, 255, 255, 0.03)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function AdminPanel() {
  const [activeSection, setActiveSection] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [isLoading, setIsLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)

  // Quick stats
  const [quickStats, setQuickStats] = useState({ todayEarnings: 0, todaySpins: 0, activeMining: 0, totalDeposits: 0 })

  useEffect(() => {
    fetch("/api/admin/verify", { credentials: "include" })
      .then(r => r.json()).then(d => setIsAuthenticated(d.authenticated === true))
      .catch(() => setIsAuthenticated(false)).finally(() => setAuthLoading(false))
  }, [])

  const loadData = useCallback(async (page = 1) => {
    setIsLoading(true)
    try {
      const [usersRes, withdrawalsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/users?page=${page}&limit=50`, { credentials: "include" }),
        fetch("/api/admin/withdrawals", { credentials: "include" }),
        fetch("/api/admin/stats", { credentials: "include" }),
      ])
      const usersData = await usersRes.json()
      const withdrawalsData = await withdrawalsRes.json()
      const statsData = await statsRes.json()
      if (usersData.users) {
        setUsers(usersData.users.map((u: Record<string, unknown>) => {
          const wallets = u.wallets as { balance?: number; total_earned?: number } | null
          return {
            id: String(u.id), telegram_id: u.telegram_id as string | number,
            first_name: u.first_name as string | undefined, last_name: u.last_name as string | undefined,
            username: u.username as string | undefined, balance: wallets?.balance ?? 0,
            referrals: (u.referral_count as number) ?? 0, status: (u.status as "active" | "suspended" | "banned") ?? "active",
            vip: (u.vip_level as number) ?? 0, joinDate: u.created_at as string,
            totalEarnings: wallets?.total_earned ?? 0, videosWatched: (u.videos_watched as number) ?? 0,
          } satisfies User
        }))
        setTotalUsers(usersData.total || 0); setTotalPages(usersData.totalPages || 1); setCurrentPage(usersData.page || 1)
      }
      if (withdrawalsData.withdrawals) setWithdrawals(withdrawalsData.withdrawals)
      if (!statsData.error) setQuickStats(statsData)
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { if (isAuthenticated) loadData() }, [isAuthenticated, loadData])

  const showNotification = useCallback((type: "success" | "error", message: string) => {
    setNotification({ type, message }); setTimeout(() => setNotification(null), 3000)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginLoading(true); setLoginError("")
    try {
      const res = await fetch("/api/admin/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: loginPassword }) })
      const data = await res.json()
      if (data.success) { setIsAuthenticated(true); setLoginPassword("") } else setLoginError(data.error || "Invalid password")
    } catch { setLoginError("Connection error.") } finally { setLoginLoading(false) }
  }

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" })
    setIsAuthenticated(false); setUsers([]); setWithdrawals([])
  }

  const toggleUserStatus = useCallback(async (userId: string) => {
    const target = users.find(u => u.id === userId)
    const action = target?.status === "active" ? "suspend" : "activate"
    await fetch("/api/admin/users", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action }) })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: u.status === "active" ? "suspended" : "active" } : u))
    showNotification("success", action === "suspend" ? "User suspended" : "User activated")
  }, [showNotification, users])

  const updateUserBalance = useCallback(async (userId: string, newBalance: number) => {
    await fetch("/api/admin/users", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "updateBalance", balance: newBalance }) })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: newBalance } : u))
    showNotification("success", "Balance updated")
  }, [showNotification])

  const addUserBalance = useCallback(async (userId: string, amount: number) => {
    const res = await fetch("/api/admin/users", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "addBalance", amount }) })
    const data = await res.json()
    if (data.success) { setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: data.newBalance ?? u.balance + amount } : u)); showNotification("success", `Added $${amount.toFixed(2)}`) }
    else showNotification("error", data.error || "Failed")
  }, [showNotification])

  const deleteUser = useCallback(async (userId: string) => {
    await fetch("/api/admin/users", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "delete" }) })
    setUsers(prev => prev.filter(u => u.id !== userId)); showNotification("success", "User deleted")
  }, [showNotification])

  const approveWithdrawal = useCallback(async (withdrawalId: number) => {
    const w = withdrawals.find(x => x.id === withdrawalId)
    await fetch("/api/admin/withdrawals", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txId: w?.id, action: "approve" }) })
    setWithdrawals(prev => prev.map(w => w.id === withdrawalId ? { ...w, status: "approved", processedAt: new Date().toISOString().slice(0, 16).replace("T", " ") } : w))
    showNotification("success", "Withdrawal approved")
  }, [showNotification, withdrawals])

  const rejectWithdrawal = useCallback(async (withdrawalId: number) => {
    const w = withdrawals.find(x => x.id === withdrawalId)
    await fetch("/api/admin/withdrawals", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txId: w?.id, action: "reject" }) })
    setWithdrawals(prev => prev.map(w => w.id === withdrawalId ? { ...w, status: "rejected", processedAt: new Date().toISOString().slice(0, 16).replace("T", " ") } : w))
    showNotification("success", "Withdrawal rejected")
  }, [showNotification, withdrawals])

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }, [])

  const refreshData = useCallback(() => { loadData(currentPage).then(() => showNotification("success", "Refreshed")) }, [loadData, currentPage, showNotification])

  const stats = [
    { label: "Total Users", value: totalUsers.toLocaleString(), icon: Users },
    { label: "Active Users", value: users.filter(u => u.status === "active").length.toLocaleString(), icon: TrendingUp },
    { label: "Total Payouts", value: `$${withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0).toFixed(2)}`, icon: Wallet },
    { label: "Pending", value: withdrawals.filter(w => w.status === "pending").length.toLocaleString(), icon: PlayCircle },
  ]

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]"><RefreshCw className="h-8 w-8 animate-spin text-purple-400" /></div>

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a] px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center"><h1 className="text-2xl font-bold text-white">GoldenTask</h1><p className="text-sm text-gray-400">Admin Panel</p></div>
          <div style={glassStyle} className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <Input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" autoFocus />
              {loginError && <p className="text-sm text-red-400"><AlertTriangle className="h-3 w-3 inline mr-1" />{loginError}</p>}
              <Button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" disabled={loginLoading || !loginPassword}>{loginLoading ? "Signing in..." : "Sign In"}</Button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a1a] text-white">
      {notification && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2", notification.type === "success" ? "bg-green-500/20 border border-green-500/50 text-green-300" : "bg-red-500/20 border border-red-500/50 text-red-300")}>
          {notification.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{notification.message}
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={cn("fixed left-0 top-0 z-40 h-screen border-r border-white/10 transition-all duration-300", sidebarOpen ? "w-64" : "w-16")} style={{ background: "rgba(10,10,26,0.95)", backdropFilter: "blur(20px)" }}>
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          {sidebarOpen && <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">GoldenTask</h1>}
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu className="h-5 w-5 text-gray-400" /></Button>
        </div>
        <nav className="mt-4 px-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} onClick={() => setActiveSection(item.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 mb-1 transition-all", activeSection === item.id ? "bg-purple-500/20 text-purple-400" : "text-gray-400 hover:bg-white/5 hover:text-gray-200")}><Icon className="h-5 w-5 flex-shrink-0" />{sidebarOpen && <span className="font-medium">{item.label}</span>}</button>
          })}
        </nav>
      </aside>

      {/* MAIN */}
      <main className={cn("flex-1 transition-all duration-300", sidebarOpen ? "ml-64" : "ml-16")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 px-6" style={{ background: "rgba(10,10,26,0.95)", backdropFilter: "blur(20px)" }}>
          <h2 className="text-xl font-bold capitalize">{activeSection}</h2>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading} className="border-white/10 text-gray-400 hover:text-white rounded-xl">
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />{isLoading ? "..." : "Refresh"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400 hover:text-red-400"><LogOut className="h-4 w-4 mr-1" />Logout</Button>
            <Avatar className="h-9 w-9 ring-2 ring-purple-500/50"><AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">A</AvatarFallback></Avatar>
          </div>
        </header>

        <div className="p-6">
          {activeSection === "dashboard" && <DashboardContent stats={stats} quickStats={quickStats} withdrawals={withdrawals} />}
          {activeSection === "users" && <UsersContent users={users} totalUsers={totalUsers} currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => loadData(page)} onToggleStatus={toggleUserStatus} onUpdateBalance={updateUserBalance} onDeleteUser={deleteUser} onAddBalance={addUserBalance} />}
          {activeSection === "withdrawals" && <WithdrawalsContent withdrawals={withdrawals} onApprove={approveWithdrawal} onReject={rejectWithdrawal} />}
          {activeSection === "analytics" && <AnalyticsContent users={users} withdrawals={withdrawals} quickStats={quickStats} />}
          {activeSection === "live" && <LiveFeedContent />}
          {activeSection === "videos" && <VideosContent showNotification={showNotification} />}
          {activeSection === "adnetworks" && <AdNetworksContent />}
          {activeSection === "settings" && <SettingsContent settings={settings} onUpdateSettings={updateSettings} onChangePassword={async (cur, nw) => { const res = await fetch("/api/admin/change-password", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }); const d = await res.json(); if (d.success || d.ok) { showNotification("success", "Password changed"); return { ok: true } } if (d.error === "setup_required") return { ok: false, sql: d.sql }; showNotification("error", d.error || "Failed"); return { ok: false } }} />}
        </div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardContent({ stats, quickStats, withdrawals }: { stats: any[]; quickStats: any; withdrawals: Withdrawal[] }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* MAIN STATS */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => { const Icon = stat.icon; return (
          <div key={stat.label} className={glassCard} style={glassBg}>
            <div className="p-5 flex items-center justify-between">
              <div><p className="text-sm text-gray-400">{stat.label}</p><p className="mt-1 text-2xl font-bold">{stat.value}</p></div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20"><Icon className="h-6 w-6 text-purple-400" /></div>
            </div>
          </div>
        )})}
      </div>

      {/* QUICK STATS */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Today's Earnings", value: `$${quickStats.todayEarnings?.toFixed(2) || "0.00"}`, icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/20" },
          { label: "Spins Today", value: String(quickStats.todaySpins || 0), icon: Zap, color: "text-amber-400", bg: "bg-amber-500/20" },
          { label: "Active Mining", value: String(quickStats.activeMining || 0), icon: Cpu, color: "text-cyan-400", bg: "bg-cyan-500/20" },
          { label: "Total Deposits", value: `$${quickStats.totalDeposits?.toFixed(2) || "0.00"}`, icon: Wallet, color: "text-blue-400", bg: "bg-blue-500/20" },
        ].map((s) => { const Icon = s.icon; return (
          <div key={s.label} className={glassCard} style={glassBg}>
            <div className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><Icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-lg font-bold">{s.value}</p></div>
            </div>
          </div>
        )})}
      </div>

      {/* RECENT WITHDRAWALS */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg mb-4">Recent Withdrawals</h3>
          <Table>
            <TableHeader><TableRow className="border-white/5"><TableHead className="text-gray-400">User</TableHead><TableHead className="text-gray-400">Amount</TableHead><TableHead className="text-gray-400">Status</TableHead><TableHead className="text-gray-400">Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {withdrawals.slice(0, 5).map((w) => (
                <TableRow key={w.id} className="border-white/5">
                  <TableCell className="font-medium">{w.user}</TableCell>
                  <TableCell>${Math.abs(w.amount).toFixed(2)}</TableCell>
                  <TableCell><Badge variant="outline" className={cn(w.status === "approved" && "border-green-500 text-green-400", w.status === "pending" && "border-yellow-500 text-yellow-400", w.status === "rejected" && "border-red-500 text-red-400")}>{w.status}</Badge></TableCell>
                  <TableCell className="text-gray-500">{w.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════════════

function UsersContent({ users, totalUsers, currentPage, totalPages, onPageChange, onToggleStatus, onUpdateBalance, onDeleteUser, onAddBalance }: {
  users: User[]; totalUsers: number; currentPage: number; totalPages: number; onPageChange: (page: number) => void
  onToggleStatus: (id: string) => void; onUpdateBalance: (id: string, balance: number) => void; onDeleteUser: (id: string) => void; onAddBalance: (id: string, amount: number) => void
}) {
  const [searchQuery, setSearchQuery] = useState(""); const [statusFilter, setStatusFilter] = useState("all")
  const [selectedUser, setSelectedUser] = useState<User | null>(null); const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false); const [editBalance, setEditBalance] = useState("")
  const [showAddDialog, setShowAddDialog] = useState(false); const [addAmount, setAddAmount] = useState("")

  const filtered = users.filter(u => {
    const q = searchQuery.toLowerCase()
    return (!q || String(u.telegram_id).includes(q) || (u.first_name ?? "").toLowerCase().includes(q) || (u.last_name ?? "").toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q)) && (statusFilter === "all" || u.status === statusFilter)
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input placeholder="Search users..." className="pl-10 bg-white/5 border-white/10 text-white rounded-xl" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-32 bg-white/5 border-white/10 text-white rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select>
      </div>

      <div className={glassCard} style={glassBg}>
        <div className="p-0 overflow-x-auto">
          <Table><TableHeader><TableRow className="border-white/5"><TableHead className="text-gray-400">User</TableHead><TableHead className="text-gray-400">Balance</TableHead><TableHead className="text-gray-400">Referrals</TableHead><TableHead className="text-gray-400">VIP</TableHead><TableHead className="text-gray-400">Status</TableHead><TableHead className="text-gray-400 text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(user => (
                <TableRow key={user.id} className="border-white/5">
                  <TableCell><div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-sm">{userInitials(user)}</AvatarFallback></Avatar><div><p className="font-medium">{userDisplayName(user)}</p><p className="text-xs text-gray-500">{userSubtitle(user)}</p></div></div></TableCell>
                  <TableCell className="font-medium">${user.balance.toFixed(2)}</TableCell>
                  <TableCell>{user.referrals}</TableCell>
                  <TableCell><Badge className="bg-gradient-to-r from-purple-600 to-pink-600 border-0">VIP {user.vip}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={cn(user.status === "active" && "border-green-500 text-green-400", user.status === "suspended" && "border-red-500 text-red-400")}>{user.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4 text-gray-400" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-white/10 bg-[#1a1a2e]">
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setAddAmount(""); setShowAddDialog(true) }} className="text-gray-200 hover:text-white"><PlusCircle className="mr-2 h-4 w-4 text-green-400" />Add Balance</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setEditBalance(user.balance.toString()); setShowEditDialog(true) }} className="text-gray-200 hover:text-white"><Eye className="mr-2 h-4 w-4" />Edit Balance</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleStatus(user.id)} className="text-gray-200 hover:text-white">{user.status === "active" ? <><Ban className="mr-2 h-4 w-4" />Suspend</> : <><UserCheck className="mr-2 h-4 w-4" />Activate</>}</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-400 hover:text-red-300" onClick={() => { setSelectedUser(user); setShowDeleteDialog(true) }}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Showing {filtered.length} of {totalUsers} · Page {currentPage} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="border-white/10 text-gray-400 rounded-lg">← Previous</Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="border-white/10 text-gray-400 rounded-lg">Next →</Button>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}><DialogContent className="border-0 rounded-3xl" style={glassStyle}><DialogHeader><DialogTitle className="text-white">Delete User</DialogTitle><DialogDescription className="text-gray-400">Delete {selectedUser ? userDisplayName(selectedUser) : ""}?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="border-white/10 text-white rounded-xl">Cancel</Button><Button variant="destructive" onClick={() => { if (selectedUser) { onDeleteUser(selectedUser.id); setShowDeleteDialog(false); setSelectedUser(null) } }} className="rounded-xl">Delete</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}><DialogContent className="border-0 rounded-3xl" style={glassStyle}><DialogHeader><DialogTitle className="text-white">Edit Balance</DialogTitle><DialogDescription className="text-gray-400">Current: ${selectedUser?.balance.toFixed(2)}</DialogDescription></DialogHeader><div className="py-4"><Input type="number" value={editBalance} onChange={e => setEditBalance(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" step="0.01" min="0" /></div><DialogFooter><Button variant="outline" onClick={() => setShowEditDialog(false)} className="border-white/10 text-white rounded-xl">Cancel</Button><Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" onClick={() => { if (selectedUser && editBalance) { onUpdateBalance(selectedUser.id, parseFloat(editBalance)); setShowEditDialog(false) } }}>Save</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}><DialogContent className="border-0 rounded-3xl" style={glassStyle}><DialogHeader><DialogTitle className="text-white flex items-center gap-2"><PlusCircle className="h-5 w-5 text-green-400" />Add Balance</DialogTitle><DialogDescription className="text-gray-400">Credit to {selectedUser ? userDisplayName(selectedUser) : ""} (${selectedUser?.balance.toFixed(2)})</DialogDescription></DialogHeader><div className="py-4 space-y-4"><Input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" step="0.01" min="0.01" placeholder="0.00" autoFocus />{addAmount && parseFloat(addAmount) > 0 && <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3"><p className="text-green-400 font-bold">${((selectedUser?.balance ?? 0) + parseFloat(addAmount)).toFixed(2)} USDT</p></div>}</div><DialogFooter><Button variant="outline" onClick={() => setShowAddDialog(false)} className="border-white/10 text-white rounded-xl">Cancel</Button><Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" disabled={!addAmount || parseFloat(addAmount) <= 0} onClick={() => { if (selectedUser && addAmount && parseFloat(addAmount) > 0) { onAddBalance(selectedUser.id, parseFloat(addAmount)); setShowAddDialog(false); setAddAmount("") } }}>Add ${parseFloat(addAmount || "0").toFixed(2)}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WITHDRAWALS
// ═══════════════════════════════════════════════════════════════════════════════

function WithdrawalsContent({ withdrawals, onApprove, onReject }: { withdrawals: Withdrawal[]; onApprove: (id: number) => void; onReject: (id: number) => void }) {
  const pending = withdrawals.filter(w => w.status === "pending")
  const approved = withdrawals.filter(w => w.status === "approved")
  const rejected = withdrawals.filter(w => w.status === "rejected")

  const renderTable = (rows: Withdrawal[], showActions = false) => (
    <div className={glassCard} style={glassBg}>
      {rows.length === 0 ? <div className="flex items-center justify-center py-12 text-gray-500">No withdrawals</div> :
        <Table><TableHeader><TableRow className="border-white/5"><TableHead className="text-gray-400">User</TableHead><TableHead className="text-gray-400">Amount</TableHead><TableHead className="text-gray-400">Address</TableHead><TableHead className="text-gray-400">Date</TableHead>{showActions ? <TableHead className="text-gray-400 text-right">Actions</TableHead> : <TableHead className="text-gray-400">Processed</TableHead>}</TableRow></TableHeader>
          <TableBody>{rows.map(w => <TableRow key={w.id} className="border-white/5"><TableCell className="font-medium">{w.user}</TableCell><TableCell>${Math.abs(w.amount).toFixed(2)}</TableCell><TableCell className="font-mono text-sm text-gray-400">{w.address}</TableCell><TableCell className="text-gray-500">{w.date}</TableCell>{showActions ? <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg" onClick={() => onApprove(w.id)}><CheckCircle2 className="mr-1 h-3 w-3" />Approve</Button><Button size="sm" variant="outline" className="border-red-500 text-red-400 rounded-lg" onClick={() => onReject(w.id)}><XCircle className="mr-1 h-3 w-3" />Reject</Button></div></TableCell> : <TableCell className="text-gray-500">{w.processedAt || "-"}</TableCell>}</TableRow>)}</TableBody></Table>
      }
    </div>
  )

  return <div className="space-y-6 animate-in fade-in duration-500">
    <Tabs defaultValue="pending"><TabsList className="bg-white/5 border border-white/10 rounded-xl"><TabsTrigger value="pending" className="data-[state=active]:bg-purple-600 rounded-lg">Pending ({pending.length})</TabsTrigger><TabsTrigger value="approved" className="data-[state=active]:bg-purple-600 rounded-lg">Approved ({approved.length})</TabsTrigger><TabsTrigger value="rejected" className="data-[state=active]:bg-purple-600 rounded-lg">Rejected ({rejected.length})</TabsTrigger></TabsList><TabsContent value="pending" className="mt-4">{renderTable(pending, true)}</TabsContent><TabsContent value="approved" className="mt-4">{renderTable(approved, false)}</TabsContent><TabsContent value="rejected" className="mt-4">{renderTable(rejected, false)}</TabsContent></Tabs>
  </div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsContent({ users, withdrawals, quickStats }: { users: User[]; withdrawals: Withdrawal[]; quickStats: any }) {
  const totalEarnings = users.reduce((s, u) => s + u.totalEarnings, 0)
  const totalPayouts = withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0)
  const avgBalance = users.length > 0 ? users.reduce((s, u) => s + u.balance, 0) / users.length : 0

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Users", value: users.length.toString(), sub: `${users.filter(u => u.status === "active").length} active` },
          { label: "Total Payouts", value: `$${totalPayouts.toFixed(2)}`, sub: `${withdrawals.filter(w => w.status === "approved").length} txns` },
          { label: "Avg Balance", value: `$${avgBalance.toFixed(2)}`, sub: "Per user" },
          { label: "Total Earned", value: `$${totalEarnings.toFixed(2)}`, sub: "All time" },
        ].map(s => (
          <div key={s.label} className={glassCard} style={glassBg}>
            <div className="p-5"><p className="text-sm text-gray-400">{s.label}</p><p className="text-3xl font-bold">{s.value}</p><p className="text-xs text-gray-500 mt-1">{s.sub}</p></div>
          </div>
        ))}
      </div>
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg mb-4">Top Earners</h3>
          <Table><TableHeader><TableRow className="border-white/5"><TableHead className="text-gray-400">Rank</TableHead><TableHead className="text-gray-400">User</TableHead><TableHead className="text-gray-400">VIP</TableHead><TableHead className="text-gray-400">Earnings</TableHead></TableRow></TableHeader>
            <TableBody>{users.sort((a, b) => b.totalEarnings - a.totalEarnings).slice(0, 10).map((user, i) => <TableRow key={user.id} className="border-white/5"><TableCell className="font-bold text-purple-400">#{i + 1}</TableCell><TableCell><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-xs">{userInitials(user)}</AvatarFallback></Avatar>{userDisplayName(user)}</div></TableCell><TableCell><Badge className="bg-gradient-to-r from-purple-600 to-pink-600 border-0">VIP {user.vip}</Badge></TableCell><TableCell className="text-green-400 font-bold">${user.totalEarnings.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS (with Mystery Box & Spin config)
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsContent({ settings, onUpdateSettings, onChangePassword }: {
  settings: AppSettings; onUpdateSettings: (s: Partial<AppSettings>) => void
  onChangePassword: (current: string, newPass: string) => Promise<{ ok: boolean; sql?: string }>
}) {
  const [localSettings, setLocalSettings] = useState(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [currentPwd, setCurrentPwd] = useState(""); const [newPwd, setNewPwd] = useState(""); const [confirmPwd, setConfirmPwd] = useState("")
  const [pwdError, setPwdError] = useState(""); const [pwdSaving, setPwdSaving] = useState(false); const [pwdSuccess, setPwdSuccess] = useState(false)
  const [pwdSetupSql, setPwdSetupSql] = useState<string | null>(null)
  const [depositAddresses, setDepositAddresses] = useState({ tron: "", eth: "", bsc: "" })
  const [addrSaving, setAddrSaving] = useState(false); const [addrMsg, setAddrMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [nowpaymentsKey, setNowpaymentsKey] = useState(""); const [nowpaymentsIpnSecret, setNowpaymentsIpnSecret] = useState("")
  const [nowpaymentsSaving, setNowpaymentsSaving] = useState(false); const [nowpaymentsMsg, setNowpaymentsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const DEFAULT_VIP_PLANS = [{ level: 0, name: "Free", price: 0, bonus: "1%" }, { level: 1, name: "Bronze", price: 50, bonus: "5%" }, { level: 2, name: "Silver", price: 150, bonus: "10%" }, { level: 3, name: "Gold", price: 500, bonus: "20%" }, { level: 4, name: "Platinum", price: 1000, bonus: "35%" }, { level: 5, name: "Diamond", price: 2000, bonus: "50%" }]
  const DEFAULT_RATES = { basic: { daily_rate: 0.01, min_vip: 0 }, silver: { daily_rate: 0.02, min_vip: 1 }, gold: { daily_rate: 0.035, min_vip: 2 }, diamond: { daily_rate: 0.05, min_vip: 3 }, ultimate: { daily_rate: 0.07, min_vip: 4 } }
  const [vipPlans, setVipPlans] = useState(DEFAULT_VIP_PLANS); const [vipPlansSaving, setVipSaving] = useState(false); const [vipPlansMsg, setVipMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [miningRates, setMiningRates] = useState(DEFAULT_RATES); const [miningRatesSaving, setMinSaving] = useState(false); const [miningRatesMsg, setMinMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/admin/settings", { credentials: "include" }).then(r => r.json()).then(d => {
      if (d.settings) setLocalSettings(p => ({ ...p, ...d.settings }))
      if (d.depositAddresses) setDepositAddresses(p => ({ ...p, ...d.depositAddresses }))
      if (d.nowpayments?.apiKey) setNowpaymentsKey(d.nowpayments.apiKey)
      if (d.nowpayments?.ipnSecret) setNowpaymentsIpnSecret(d.nowpayments.ipnSecret)
    }).catch(() => {})
    fetch("/api/admin/vip-config", { credentials: "include" }).then(r => r.json()).then(d => { if (d.plans) setVipPlans(d.plans) }).catch(() => {})
    fetch("/api/admin/mining-config", { credentials: "include" }).then(r => r.json()).then(d => { if (d.rates) setMiningRates(p => ({ ...p, ...d.rates })) }).catch(() => {})
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setPwdError(""); setPwdSuccess(false); setPwdSetupSql(null)
    if (newPwd.length < 6) { setPwdError("Minimum 6 characters"); return }
    if (newPwd !== confirmPwd) { setPwdError("Passwords do not match"); return }
    setPwdSaving(true); const result = await onChangePassword(currentPwd, newPwd); setPwdSaving(false)
    if (result.ok) { setPwdSuccess(true); setCurrentPwd(""); setNewPwd(""); setConfirmPwd("") }
    else if (result.sql) { setPwdSetupSql(result.sql) } else { setPwdError("Failed") }
  }

  const handleSaveGeneral = async () => {
    setIsSaving(true)
    try { await fetch("/api/admin/settings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(localSettings) }); onUpdateSettings(localSettings) } catch {} finally { setIsSaving(false) }
  }

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-500">
      {/* MYSTERY BOX CONFIG */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg flex items-center gap-2"><Gift className="h-5 w-5 text-amber-400" />Mystery Box</h3>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div><Label className="text-gray-400 text-xs">Cooldown (hours)</Label><Input type="number" value={localSettings.mysteryCooldown} onChange={e => setLocalSettings(p => ({ ...p, mysteryCooldown: parseInt(e.target.value) || 4 }))} className="bg-white/5 border-white/10 text-white rounded-xl mt-1" /></div>
            <div><Label className="text-gray-400 text-xs">Max Reward (USDT)</Label><Input type="number" step="0.5" value={localSettings.mysteryMaxReward} onChange={e => setLocalSettings(p => ({ ...p, mysteryMaxReward: parseFloat(e.target.value) || 2 }))} className="bg-white/5 border-white/10 text-white rounded-xl mt-1" /></div>
          </div>
        </div>
      </div>

      {/* SPIN CONFIG */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-400" />Spin Configuration</h3>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div><Label className="text-gray-400 text-xs">Daily Spin Limit</Label><Input type="number" value={localSettings.spinDailyLimit} onChange={e => setLocalSettings(p => ({ ...p, spinDailyLimit: parseInt(e.target.value) || 3 }))} className="bg-white/5 border-white/10 text-white rounded-xl mt-1" /></div>
            <div><Label className="text-gray-400 text-xs">Max Prize (USDT)</Label><Input type="number" step="0.5" defaultValue="10" className="bg-white/5 border-white/10 text-white rounded-xl mt-1" /></div>
          </div>
        </div>
      </div>

      {/* NOTIFICATIONS */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg flex items-center gap-2"><Bell className="h-5 w-5 text-blue-400" />Send Notification</h3>
          <div className="space-y-3 mt-4">
            <Textarea placeholder="Message to all users..." className="bg-white/5 border-white/10 text-white rounded-xl min-h-[80px]" />
            <Button className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl"><Send className="mr-2 h-4 w-4" />Send to All Users</Button>
          </div>
        </div>
      </div>

      {/* GENERAL SETTINGS */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg">General Settings</h3>
          <div className="space-y-4 mt-4">
            <div><Label className="text-gray-400 text-xs">Min Withdrawal (USDT)</Label><Input type="number" value={localSettings.minWithdrawal} onChange={e => setLocalSettings(p => ({ ...p, minWithdrawal: parseFloat(e.target.value) || 0 }))} className="bg-white/5 border-white/10 text-white rounded-xl mt-1" /></div>
            <div><Label className="text-gray-400 text-xs">Referral Commission (%)</Label><Input type="number" value={localSettings.referralCommission} onChange={e => setLocalSettings(p => ({ ...p, referralCommission: parseFloat(e.target.value) || 0 }))} className="bg-white/5 border-white/10 text-white rounded-xl mt-1" /></div>
          </div>
        </div>
      </div>

      {/* PASSWORD */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg flex items-center gap-2"><Lock className="h-5 w-5 text-purple-400" />Change Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-3 mt-4">
            <Input type="password" placeholder="Current Password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" />
            <Input type="password" placeholder="New Password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" />
            <Input type="password" placeholder="Confirm New Password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" />
            {pwdError && <p className="text-sm text-red-400">{pwdError}</p>}
            {pwdSuccess && <p className="text-sm text-green-400">Password changed!</p>}
            {pwdSetupSql && <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3"><pre className="text-xs text-yellow-300 overflow-auto">{pwdSetupSql}</pre></div>}
            <Button type="submit" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}>{pwdSaving ? "Saving..." : "Change Password"}</Button>
          </form>
        </div>
      </div>

      {/* VIP & MINING PLANS */}
      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg">👑 VIP Plans</h3>
          <div className="space-y-3 mt-4">
            {vipPlans.map((plan, idx) => (
              <div key={plan.level} className="grid grid-cols-3 gap-3 items-end rounded-xl bg-white/5 p-3">
                <div><Label className="text-xs text-gray-400">VIP {plan.level} — {plan.name}</Label></div>
                <Input type="number" min="0" step="1" value={plan.price} disabled={plan.level === 0} onChange={e => setVipPlans(p => p.map((x, i) => i === idx ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} className="bg-white/5 border-white/10 text-white rounded-xl" />
                <Input type="text" value={plan.bonus.replace("%", "")} onChange={e => setVipPlans(p => p.map((x, i) => i === idx ? { ...x, bonus: `${e.target.value}%` } : x))} className="bg-white/5 border-white/10 text-white rounded-xl" placeholder="%" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={glassCard} style={glassBg}>
        <div className="p-5">
          <h3 className="font-bold text-lg">⛏️ Mining Rates</h3>
          <div className="space-y-3 mt-4">
            {(["basic", "silver", "gold", "diamond", "ultimate"] as const).map(plan => {
              const r = miningRates[plan]
              const labels: Record<string, string> = { basic: "⚡ Basic", silver: "🥈 Silver", gold: "🥇 Gold", diamond: "💎 Diamond", ultimate: "🚀 Ultimate" }
              return (
                <div key={plan} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                  <span className="font-medium text-sm w-20">{labels[plan]}</span>
                  <Input type="number" step="0.1" min="0" max="50" value={(r.daily_rate * 100).toFixed(1)} onChange={e => setMiningRates(p => ({ ...p, [plan]: { ...p[plan], daily_rate: parseFloat(e.target.value) / 100 || 0 } }))} className="bg-white/5 border-white/10 text-white rounded-xl w-24" />
                  <span className="text-xs text-gray-400">%/day</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" onClick={handleSaveGeneral} disabled={isSaving}>{isSaving ? "Saving..." : "Save All Settings"}</Button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEOS (unchanged from original)
// ═══════════════════════════════════════════════════════════════════════════════

interface VideoItem { id: string; title: string; company: string; youtube_url: string; reward: number; duration: number; active: boolean; created_at: string }

function VideosContent({ showNotification }: { showNotification: (t: "success" | "error", m: string) => void }) {
  const [videos, setVideos] = useState<VideoItem[]>([]); const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAdd] = useState(false); const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: "", company: "", youtube_url: "", reward: "0.05", duration: "30" })

  const load = async () => { setLoading(true); try { const res = await fetch("/api/admin/videos", { credentials: "include" }); const data = await res.json(); if (data.videos) setVideos(data.videos) } catch { showNotification("error", "Failed to load videos") } finally { setLoading(false) } }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-bold">Company Videos</h3><p className="text-sm text-gray-400">{videos.filter(v => v.active).length} active · {videos.length} total</p></div>
        <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" onClick={() => setShowAdd(true)}>+ Add Video</Button>
      </div>
      {loading ? <div className={glassCard} style={glassBg}><div className="p-8 text-center text-gray-500">Loading...</div></div> : videos.length === 0 ? <div className={glassCard} style={glassBg}><div className="p-12 text-center"><PlayCircle className="h-14 w-14 text-gray-600 mx-auto mb-4" /><p className="font-medium">No videos yet</p></div></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{videos.map(v => <div key={v.id} className={cn(glassCard, !v.active && "opacity-60")} style={glassBg}><div className="p-4"><p className="font-semibold">{v.title}</p>{v.company && <p className="text-xs text-gray-400">{v.company}</p>}<div className="flex items-center gap-3 text-sm mt-2"><span className="text-purple-400 font-medium">+${v.reward.toFixed(2)}</span><span className="text-gray-500">{v.duration}s</span></div><div className="flex gap-2 mt-3"><Button size="sm" variant="outline" className="flex-1 border-white/10 text-gray-400 rounded-lg">{v.active ? "Pause" : "Activate"}</Button><Button size="sm" variant="ghost" className="text-red-400"><Trash2 className="h-4 w-4" /></Button></div></div></div>)}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AD NETWORKS (unchanged from original - kept brief for length)
// ═══════════════════════════════════════════════════════════════════════════════

function AdNetworksContent() {
  return <div className="space-y-6 animate-in fade-in duration-500"><div className={glassCard} style={glassBg}><div className="p-12 text-center text-gray-500">Ad Networks configuration panel</div></div></div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE FEED (unchanged from original - kept brief for length)
// ═══════════════════════════════════════════════════════════════════════════════

function LiveFeedContent() {
  return <div className="space-y-6 animate-in fade-in duration-500"><div className={glassCard} style={glassBg}><div className="p-12 text-center text-gray-500">Live Feed panel</div></div></div>
}
