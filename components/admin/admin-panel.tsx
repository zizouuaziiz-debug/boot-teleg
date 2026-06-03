"use client";

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Users, Wallet, TrendingUp, PlayCircle, Menu, Home, DollarSign, Settings,
  BarChart3, CheckCircle2, XCircle, Search, Filter, MoreVertical, Eye, Ban,
  RefreshCw, Trash2, UserCheck, AlertTriangle, Lock, LogOut, PlusCircle, Zap,
  ArrowDownToLine, ArrowUpFromLine, Circle,
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
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

const initialSettings: AppSettings = {
  minWithdrawal: 10, dailyVideoLimit: 50, referralCommission: 15, rewardPerVideo: 0.05,
  maxDailyEarnings: 25, cooldownSeconds: 30, minWatchPercent: 90, vipMultiplier: 1.5,
  spinDailyLimit: 3, maxDailyAds: 5, rewardPerAd: 0.05, adCooldownSeconds: 30,
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminPanel() {
  const [activeSection, setActiveSection] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  // ⭐️ Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  // ⭐️ End pagination state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [isLoading, setIsLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    fetch("/api/admin/verify", { credentials: "include" })
      .then(r => r.json())
      .then(d => setIsAuthenticated(d.authenticated === true))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthLoading(false))
  }, [])

  // ⭐️ Updated loadData with pagination
  const loadData = useCallback(async (page = 1) => {
    setIsLoading(true)
    try {
      const [usersRes, withdrawalsRes] = await Promise.all([
        fetch(`/api/admin/users?page=${page}&limit=50`, { credentials: "include" }),
        fetch("/api/admin/withdrawals", { credentials: "include" }),
      ])
      const usersData = await usersRes.json()
      const withdrawalsData = await withdrawalsRes.json()
      if (usersData.users) {
        setUsers(usersData.users.map((u: Record<string, unknown>) => {
          const wallets = u.wallets as { balance?: number; total_earned?: number } | null
          return {
            id: String(u.id), telegram_id: u.telegram_id as string | number,
            first_name: u.first_name as string | undefined, last_name: u.last_name as string | undefined,
            username: u.username as string | undefined, balance: wallets?.balance ?? 0,
            referrals: (u.referral_count as number) ?? 0,
            status: (u.status as "active" | "suspended" | "banned") ?? "active",
            vip: (u.vip_level as number) ?? 0, joinDate: u.created_at as string,
            totalEarnings: wallets?.total_earned ?? 0, videosWatched: (u.videos_watched as number) ?? 0,
          } satisfies User
        }))
        setTotalUsers(usersData.total || 0)
        setTotalPages(usersData.totalPages || 1)
        setCurrentPage(usersData.page || 1)
      }
      if (withdrawalsData.withdrawals) setWithdrawals(withdrawalsData.withdrawals)
    } catch {}
    setIsLoading(false)
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
      if (data.success) { setIsAuthenticated(true); setLoginPassword("") }
      else setLoginError(data.error || "Invalid password")
    } catch { setLoginError("Connection error.") }
    setLoginLoading(false)
  }

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" })
    setIsAuthenticated(false); setUsers([]); setWithdrawals([])
  }

  // ⭐️ Refresh stays on current page
  const refreshData = useCallback(() => {
    loadData(currentPage).then(() => showNotification("success", "Data refreshed"))
  }, [loadData, currentPage, showNotification])

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
    showNotification("success", "User balance updated")
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
    showNotification("success", "Settings saved successfully")
  }, [showNotification])

  const stats = [
    { label: "Total Users", value: totalUsers.toLocaleString(), icon: Users, trend: "up" },
    { label: "Active Users", value: users.filter(u => u.status === "active").length.toLocaleString(), icon: TrendingUp, trend: "up" },
    { label: "Total Payouts", value: `$${withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0).toFixed(2)}`, icon: Wallet, trend: "up" },
    { label: "Pending", value: withdrawals.filter(w => w.status === "pending").length.toLocaleString(), icon: PlayCircle, trend: "up" },
  ]

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center"><h1 className="text-2xl font-bold text-gradient">GoldenTask</h1><p className="text-sm text-muted-foreground">Admin Panel</p></div>
          <Card className="glass-card"><CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <Input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="bg-secondary/50" autoFocus />
              {loginError && <p className="text-sm text-destructive"><AlertTriangle className="h-3 w-3 inline mr-1" />{loginError}</p>}
              <Button type="submit" className="primary-gradient w-full" disabled={loginLoading || !loginPassword}>{loginLoading ? "Signing in..." : "Sign In"}</Button>
            </form>
          </CardContent></Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      {notification && (
        <div className={cn("fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2", notification.type === "success" ? "bg-green-500/20 border border-green-500/50 text-green-300" : "bg-destructive text-destructive-foreground")}>
          {notification.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{notification.message}
        </div>
      )}
      <aside className={cn("fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300", sidebarOpen ? "w-64" : "w-16")}>
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {sidebarOpen && <h1 className="text-lg font-bold text-gradient">GoldenTask</h1>}
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu className="h-5 w-5" /></Button>
        </div>
        <nav className="mt-4 px-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} onClick={() => setActiveSection(item.id)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 mb-1 transition-all", activeSection === item.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}><Icon className="h-5 w-5 flex-shrink-0" />{sidebarOpen && <span className="font-medium">{item.label}</span>}</button>
          })}
        </nav>
      </aside>
      <main className={cn("flex-1 transition-all duration-300", sidebarOpen ? "ml-64" : "ml-16")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6">
          <h2 className="text-xl font-semibold text-foreground capitalize">{activeSection}</h2>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />{isLoading ? "..." : "Refresh"}</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive"><LogOut className="h-4 w-4 mr-1" />Logout</Button>
            <Avatar className="h-9 w-9 ring-2 ring-primary/50"><AvatarFallback className="bg-primary text-primary-foreground">A</AvatarFallback></Avatar>
          </div>
        </header>
        <div className="p-6">
          {activeSection === "dashboard"   && <DashboardContent stats={stats} withdrawals={withdrawals} />}
          {/* ⭐️ Users with pagination props */}
          {activeSection === "users"       && <UsersContent users={users} totalUsers={totalUsers} currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => loadData(page)} onToggleStatus={toggleUserStatus} onUpdateBalance={updateUserBalance} onDeleteUser={deleteUser} onAddBalance={addUserBalance} />}
          {activeSection === "withdrawals" && <WithdrawalsContent withdrawals={withdrawals} onApprove={approveWithdrawal} onReject={rejectWithdrawal} />}
          {activeSection === "analytics"   && <AnalyticsContent users={users} withdrawals={withdrawals} />}
          {activeSection === "live"        && <LiveFeedContent />}
          {activeSection === "videos"      && <VideosContent showNotification={showNotification} />}
          {activeSection === "adnetworks"  && <AdNetworksContent />}
          {activeSection === "settings" && (
  <SettingsContent
    settings={settings}
    onUpdateSettings={updateSettings}
    onChangePassword={async (cur, nw) => {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      })
      const d = await res.json()
      if (d.success || d.ok) {
        showNotification("success", "Password changed successfully")
        return { ok: true }
      }
      if (d.error === "setup_required") return { ok: false, sql: d.sql }
      showNotification("error", d.error || "Failed to change password")
      return { ok: false }
    }}
  />
)}
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardContent({ stats, withdrawals }: { stats: any[]; withdrawals: Withdrawal[] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => { const Icon = stat.icon; return <Card key={stat.label} className="glass-card"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{stat.label}</p><p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p></div><div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20"><Icon className="h-6 w-6 text-primary" /></div></div></CardContent></Card> })}
      </div>
      <Card className="glass-card"><CardHeader><CardTitle>Recent Withdrawals</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{withdrawals.slice(0, 5).map((w) => <TableRow key={w.id}><TableCell className="font-medium">{w.user}</TableCell><TableCell>${Math.abs(w.amount).toFixed(2)}</TableCell><TableCell><Badge variant="outline" className={cn(w.status === "approved" && "border-green-500 text-green-400", w.status === "pending" && "border-primary text-primary", w.status === "rejected" && "border-destructive text-destructive")}>{w.status}</Badge></TableCell><TableCell className="text-muted-foreground">{w.date}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  )
}

// ─── Users with Pagination ────────────────────────────────────────────────────
function UsersContent({ users, totalUsers, currentPage, totalPages, onPageChange, onToggleStatus, onUpdateBalance, onDeleteUser, onAddBalance }: {
  users: User[]; totalUsers: number; currentPage: number; totalPages: number
  onPageChange: (page: number) => void; onToggleStatus: (id: string) => void
  onUpdateBalance: (id: string, balance: number) => void; onDeleteUser: (id: string) => void
  onAddBalance: (id: string, amount: number) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editBalance, setEditBalance] = useState("")
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addAmount, setAddAmount] = useState("")

  const filtered = users.filter(u => {
    const q = searchQuery.toLowerCase()
    return (!q || String(u.telegram_id).includes(q) || (u.first_name ?? "").toLowerCase().includes(q) || (u.last_name ?? "").toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q)) && (statusFilter === "all" || u.status === statusFilter)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search users..." className="pl-10 bg-secondary/50" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-32 bg-secondary/50"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select>
      </div>
      <Card className="glass-card"><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Balance</TableHead><TableHead>Referrals</TableHead><TableHead>VIP</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map(user => (
              <TableRow key={user.id}>
                <TableCell><div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-secondary">{userInitials(user)}</AvatarFallback></Avatar><div><p className="font-medium text-foreground">{userDisplayName(user)}</p><p className="text-xs text-muted-foreground">{userSubtitle(user)}</p></div></div></TableCell>
                <TableCell className="font-medium">${user.balance.toFixed(2)}</TableCell>
                <TableCell>{user.referrals}</TableCell>
                <TableCell><Badge className="primary-gradient border-0">VIP {user.vip}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={cn(user.status === "active" && "border-green-500 text-green-400", user.status === "suspended" && "border-destructive text-destructive")}>{user.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setSelectedUser(user); setAddAmount(""); setShowAddDialog(true) }}><PlusCircle className="mr-2 h-4 w-4 text-green-400" />Add Balance</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setSelectedUser(user); setEditBalance(user.balance.toString()); setShowEditDialog(true) }}><Eye className="mr-2 h-4 w-4" />Edit Balance</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onToggleStatus(user.id)}>{user.status === "active" ? <><Ban className="mr-2 h-4 w-4" />Suspend</> : <><UserCheck className="mr-2 h-4 w-4" />Activate</>}</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedUser(user); setShowDeleteDialog(true) }}><Trash2 className="mr-2 h-4 w-4" />Delete User</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {/* ⭐️ Pagination Bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Showing {filtered.length} of {totalUsers} users · Page {currentPage} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>← Previous</Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next →</Button>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}><DialogContent><DialogHeader><DialogTitle>Delete User</DialogTitle><DialogDescription>Delete {selectedUser ? userDisplayName(selectedUser) : ""}?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button><Button variant="destructive" onClick={() => { if (selectedUser) { onDeleteUser(selectedUser.id); setShowDeleteDialog(false); setSelectedUser(null) } }}>Delete</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}><DialogContent><DialogHeader><DialogTitle>Edit Balance</DialogTitle><DialogDescription>Current: ${selectedUser?.balance.toFixed(2)}</DialogDescription></DialogHeader><div className="py-4"><Input type="number" value={editBalance} onChange={e => setEditBalance(e.target.value)} step="0.01" min="0" /></div><DialogFooter><Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button><Button className="primary-gradient" onClick={() => { if (selectedUser && editBalance) { onUpdateBalance(selectedUser.id, parseFloat(editBalance)); setShowEditDialog(false) } }}>Save</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-green-400" />Add Balance</DialogTitle><DialogDescription>Credit USDT to {selectedUser ? userDisplayName(selectedUser) : ""} (current: ${selectedUser?.balance.toFixed(2)})</DialogDescription></DialogHeader><div className="py-4 space-y-4"><Input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} className="bg-secondary/50" step="0.01" min="0.01" placeholder="0.00" autoFocus />{addAmount && parseFloat(addAmount) > 0 && <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3"><p className="text-xl font-bold text-green-400">${((selectedUser?.balance ?? 0) + parseFloat(addAmount)).toFixed(2)} USDT</p></div>}</div><DialogFooter><Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button><Button className="primary-gradient" disabled={!addAmount || parseFloat(addAmount) <= 0} onClick={() => { if (selectedUser && addAmount && parseFloat(addAmount) > 0) { onAddBalance(selectedUser.id, parseFloat(addAmount)); setShowAddDialog(false); setAddAmount("") } }}>Add ${parseFloat(addAmount || "0").toFixed(2)} USDT</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────
function WithdrawalsContent({ withdrawals, onApprove, onReject }: { withdrawals: Withdrawal[]; onApprove: (id: number) => void; onReject: (id: number) => void }) {
  const pending = withdrawals.filter(w => w.status === "pending")
  const approved = withdrawals.filter(w => w.status === "approved")
  const rejected = withdrawals.filter(w => w.status === "rejected")
  const renderTable = (rows: Withdrawal[], showActions = false) => (
    <Card className="glass-card"><CardContent className="p-0">
      {rows.length === 0 ? <div className="flex items-center justify-center py-12 text-muted-foreground">No withdrawals</div> :
        <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Address</TableHead><TableHead>Date</TableHead>{showActions ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Processed</TableHead>}</TableRow></TableHeader>
          <TableBody>{rows.map(w => <TableRow key={w.id}><TableCell className="font-medium">{w.user}</TableCell><TableCell>${Math.abs(w.amount).toFixed(2)}</TableCell><TableCell className="font-mono text-sm text-muted-foreground">{w.address}</TableCell><TableCell className="text-muted-foreground">{w.date}</TableCell>{showActions ? <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" className="primary-gradient" onClick={() => onApprove(w.id)}><CheckCircle2 className="mr-1 h-3 w-3" />Approve</Button><Button size="sm" variant="outline" className="border-destructive text-destructive" onClick={() => onReject(w.id)}><XCircle className="mr-1 h-3 w-3" />Reject</Button></div></TableCell> : <TableCell className="text-muted-foreground">{w.processedAt || "-"}</TableCell>}</TableRow>)}</TableBody></Table>
      }
    </CardContent></Card>
  )
  return <div className="space-y-6"><Tabs defaultValue="pending"><TabsList className="bg-secondary/50"><TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger><TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger><TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger></TabsList><TabsContent value="pending" className="mt-4">{renderTable(pending, true)}</TabsContent><TabsContent value="approved" className="mt-4">{renderTable(approved, false)}</TabsContent><TabsContent value="rejected" className="mt-4">{renderTable(rejected, false)}</TabsContent></Tabs></div>
}

// ─── Placeholder Sections (keep your originals if you have them) ──────────────
function AnalyticsContent({ users, withdrawals }: { users: User[]; withdrawals: Withdrawal[] }) {
  return <div className="text-center py-16 text-muted-foreground">Analytics coming soon</div>
}
function LiveFeedContent() {
  return <div className="text-center py-16 text-muted-foreground">Live Feed coming soon</div>
}
function VideosContent({ showNotification }: { showNotification: (t: "success"|"error", m: string) => void }) {
  return <div className="text-center py-16 text-muted-foreground">Videos management coming soon</div>
}
function AdNetworksContent() {
  return <div className="text-center py-16 text-muted-foreground">Ad Networks coming soon</div>
}
function SettingsContent({ settings, onUpdateSettings, onChangePassword }: { settings: AppSettings; onUpdateSettings: (s: Partial<AppSettings>) => void; onChangePassword: (current: string, newPass: string) => Promise<{ ok: boolean; sql?: string }> }) {
  return <div className="text-center py-16 text-muted-foreground">Settings coming soon</div>
}
