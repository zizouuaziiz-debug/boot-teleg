"use client";

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Users,
  Wallet,
  TrendingUp,
  PlayCircle,
  Menu,
  Home,
  DollarSign,
  Settings,
  BarChart3,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Ban,
  RefreshCw,
  Trash2,
  UserCheck,
  AlertTriangle,
  Lock,
  LogOut,
  PlusCircle,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  Circle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface User {
  id: string
  telegram_id: string | number
  first_name?: string
  last_name?: string
  username?: string
  balance: number
  referrals: number
  status: "active" | "suspended" | "banned"
  vip: number
  joinDate: string
  totalEarnings: number
  videosWatched: number
}

function userDisplayName(u: User): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ")
  return full || (u.username ? `@${u.username}` : `#${u.telegram_id}`)
}

function userInitials(u: User): string {
  if (u.first_name) return (u.first_name[0] + (u.last_name?.[0] ?? "")).toUpperCase()
  if (u.username)   return u.username.slice(0, 2).toUpperCase()
  return String(u.telegram_id).slice(0, 2)
}

function userSubtitle(u: User): string {
  if (u.username) return `@${u.username} · ${u.telegram_id}`
  return `ID: ${u.telegram_id}`
}

interface Withdrawal {
  id: number
  userId: number
  user: string
  amount: number
  address: string
  status: "pending" | "approved" | "rejected"
  date: string
  processedAt?: string
}

interface AppSettings {
  minWithdrawal: number
  dailyVideoLimit: number
  referralCommission: number
  rewardPerVideo: number
  maxDailyEarnings: number
  cooldownSeconds: number
  minWatchPercent: number
  vipMultiplier: number
  spinDailyLimit: number
  maxDailyAds: number
  rewardPerAd: number
  adCooldownSeconds: number
}

const initialSettings: AppSettings = {
  minWithdrawal: 10,
  dailyVideoLimit: 50,
  referralCommission: 15,
  rewardPerVideo: 0.05,
  maxDailyEarnings: 25,
  cooldownSeconds: 30,
  minWatchPercent: 90,
  vipMultiplier: 1.5,
  spinDailyLimit: 3,
  maxDailyAds: 5,
  rewardPerAd: 0.05,
  adCooldownSeconds: 30,
}

const sidebarItems = [
  { icon: Home,       label: "Dashboard",  id: "dashboard"   },
  { icon: Users,      label: "Users",      id: "users"       },
  { icon: DollarSign, label: "Withdrawals",id: "withdrawals" },
  { icon: BarChart3,  label: "Analytics",  id: "analytics"   },
  { icon: Zap,        label: "Live Feed",  id: "live"        },
  { icon: PlayCircle, label: "Videos",     id: "videos"      },
  { icon: PlayCircle, label: "Ad Networks",id: "adnetworks"  },
  { icon: Settings,   label: "Settings",   id: "settings"    },
]

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

  useEffect(() => {
    fetch("/api/admin/verify", { credentials: "include" })
      .then(r => r.json())
      .then(d => setIsAuthenticated(d.authenticated === true))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthLoading(false))
  }, [])

  const loadData = useCallback(async (page = 1) => {
    setIsLoading(true)
    try {
      const [usersRes, withdrawalsRes] = await Promise.all([
        fetch(`/api/admin/users?page=${page}&limit=50`, { credentials: "include" }),
        fetch("/api/admin/withdrawals", { credentials: "include" }),
      ])
      const usersData       = await usersRes.json()
      const withdrawalsData = await withdrawalsRes.json()
      if (usersData.users) {
        setUsers(usersData.users.map((u: Record<string, unknown>) => {
          const wallets = u.wallets as { balance?: number; total_earned?: number } | null
          return {
            id:            String(u.id),
            telegram_id:   u.telegram_id as string | number,
            first_name:    u.first_name  as string | undefined,
            last_name:     u.last_name   as string | undefined,
            username:      u.username    as string | undefined,
            balance:       wallets?.balance      ?? 0,
            referrals:     (u.referral_count as number) ?? 0,
            status:        (u.status as "active" | "suspended" | "banned") ?? "active",
            vip:           (u.vip_level  as number) ?? 0,
            joinDate:      u.created_at  as string,
            totalEarnings: wallets?.total_earned ?? 0,
            videosWatched: (u.videos_watched as number) ?? 0,
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
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true); setLoginError("")
    try {
      const res  = await fetch("/api/admin/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword }),
      })
      const data = await res.json()
      if (data.success) { setIsAuthenticated(true); setLoginPassword("") }
      else setLoginError(data.error || "Invalid password")
    } catch { setLoginError("Connection error. Try again.") }
    setLoginLoading(false)
  }

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" })
    setIsAuthenticated(false); setUsers([]); setWithdrawals([])
  }

  const toggleUserStatus = useCallback(async (userId: string) => {
    const target = users.find(u => u.id === userId)
    const action = target?.status === "active" ? "suspend" : "activate"
    await fetch("/api/admin/users", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    })
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, status: u.status === "active" ? "suspended" : "active" } : u
    ))
    showNotification("success", action === "suspend" ? "User suspended" : "User activated")
  }, [showNotification, users])

  const updateUserBalance = useCallback(async (userId: string, newBalance: number) => {
    await fetch("/api/admin/users", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "updateBalance", balance: newBalance }),
    })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: newBalance } : u))
    showNotification("success", "User balance updated")
  }, [showNotification])

  const addUserBalance = useCallback(async (userId: string, amount: number) => {
    const res  = await fetch("/api/admin/users", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "addBalance", amount }),
    })
    const data = await res.json()
    if (data.success) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: data.newBalance ?? u.balance + amount } : u))
      showNotification("success", `Added $${amount.toFixed(2)} USDT to user balance`)
    } else {
      showNotification("error", data.error || "Failed to add balance")
    }
  }, [showNotification])

  const deleteUser = useCallback(async (userId: string) => {
    await fetch("/api/admin/users", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "delete" }),
    })
    setUsers(prev => prev.filter(u => u.id !== userId))
    setWithdrawals(prev => prev.filter(w => String(w.userId) !== userId))
    showNotification("success", "User deleted successfully")
  }, [showNotification])

  const approveWithdrawal = useCallback(async (withdrawalId: number) => {
    const w = withdrawals.find(x => x.id === withdrawalId)
    await fetch("/api/admin/withdrawals", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: w?.id, action: "approve" }),
    })
    setWithdrawals(prev => prev.map(w =>
      w.id === withdrawalId
        ? { ...w, status: "approved", processedAt: new Date().toISOString().slice(0, 16).replace("T", " ") }
        : w
    ))
    showNotification("success", "Withdrawal approved")
  }, [showNotification, withdrawals])

  const rejectWithdrawal = useCallback(async (withdrawalId: number) => {
    const w = withdrawals.find(x => x.id === withdrawalId)
    await fetch("/api/admin/withdrawals", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: w?.id, action: "reject" }),
    })
    setWithdrawals(prev => prev.map(w =>
      w.id === withdrawalId
        ? { ...w, status: "rejected", processedAt: new Date().toISOString().slice(0, 16).replace("T", " ") }
        : w
    ))
    showNotification("success", "Withdrawal rejected and amount refunded")
  }, [showNotification, withdrawals])

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
    showNotification("success", "Settings saved successfully")
  }, [showNotification])

  const refreshData = useCallback(() => {
    loadData(currentPage).then(() => showNotification("success", "Data refreshed"))
  }, [loadData, currentPage, showNotification])

  const stats = [
    { label: "Total Users",   value: totalUsers.toLocaleString(),                                                                                   icon: Users,      trend: "up" },
    { label: "Active Users",  value: users.filter(u => u.status === "active").length.toLocaleString(),                                                 icon: TrendingUp, trend: "up" },
    { label: "Total Payouts", value: `$${withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0).toFixed(2)}`,              icon: Wallet,     trend: "up" },
    { label: "Pending",       value: withdrawals.filter(w => w.status === "pending").length.toLocaleString(),                                           icon: PlayCircle, trend: "up" },
  ]

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gradient">GoldenTask</h1>
            <p className="mt-1 text-sm text-muted-foreground">Admin Panel</p>
          </div>
          <Card className="glass-card">
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Password</label>
                  <Input
                    type="password"
                    placeholder="Enter admin password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="bg-secondary/50"
                    autoFocus
                  />
                </div>
                {loginError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />{loginError}
                  </p>
                )}
                <Button type="submit" className="primary-gradient w-full" disabled={loginLoading || !loginPassword}>
                  {loginLoading ? "Signing in..." : "Sign In"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">Default: <code className="bg-secondary px-1 rounded">admin123</code></p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2",
          notification.type === "success" ? "bg-green-500/20 border border-green-500/50 text-green-300" : "bg-destructive text-destructive-foreground"
        )}>
          {notification.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {notification.message}
        </div>
      )}

      <aside className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {sidebarOpen && <h1 className="text-lg font-bold text-gradient">GoldenTask</h1>}
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <nav className="mt-4 px-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 mb-1 transition-all",
                  activeSection === item.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            )
          })}
        </nav>
      </aside>

      <main className={cn("flex-1 transition-all duration-300", sidebarOpen ? "ml-64" : "ml-16")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6">
          <h2 className="text-xl font-semibold text-foreground capitalize">{activeSection}</h2>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4 mr-1" />Logout
            </Button>
            <Avatar className="h-9 w-9 ring-2 ring-primary/50">
              <AvatarFallback className="bg-primary text-primary-foreground">A</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <div className="p-6">
          {activeSection === "dashboard"   && <DashboardContent stats={stats} withdrawals={withdrawals} />}
          {activeSection === "users"       && (
            <UsersContent
              users={users}
              totalUsers={totalUsers}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => loadData(page)}
              onToggleStatus={toggleUserStatus}
              onUpdateBalance={updateUserBalance}
              onDeleteUser={deleteUser}
              onAddBalance={addUserBalance}
            />
          )}
          {activeSection === "withdrawals" && (
            <WithdrawalsContent withdrawals={withdrawals} onApprove={approveWithdrawal} onReject={rejectWithdrawal} />
          )}
          {activeSection === "analytics"   && <AnalyticsContent users={users} withdrawals={withdrawals} />}
          {activeSection === "live"        && <LiveFeedContent />}
          {activeSection === "videos"      && <VideosContent showNotification={showNotification} />}
          {activeSection === "adnetworks"  && <AdNetworksContent />}
          {activeSection === "settings"    && (
            <SettingsContent
              settings={settings}
              onUpdateSettings={updateSettings}
              onChangePassword={async (cur, nw) => {
                const res = await fetch("/api/admin/change-password", {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
                })
                const d = await res.json()
                if (d.success || d.ok) { showNotification("success", "Password changed successfully"); return { ok: true } }
                if (d.error === "setup_required") return { ok: false, sql: d.sql }
                showNotification("error", d.error || "Failed to change password")
                return { ok: false }
              }}
            />
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardContent({ stats, withdrawals }: { stats: any[]; withdrawals: Withdrawal[] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="glass-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader><CardTitle>Revenue Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mr-3 opacity-50" />
              <span>Revenue chart placeholder</span>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle>User Growth</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <TrendingUp className="h-12 w-12 mr-3 opacity-50" />
              <span>Growth chart placeholder</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader><CardTitle>Recent Withdrawals</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.slice(0, 5).map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.user}</TableCell>
                  <TableCell>${Math.abs(w.amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      w.status === "approved" && "border-green-500 text-green-400",
                      w.status === "pending"  && "border-primary text-primary",
                      w.status === "rejected" && "border-destructive text-destructive"
                    )}>{w.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{w.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Users ────────────────────────────────────────────────────────────────────

function UsersContent({ users, totalUsers, currentPage, totalPages, onPageChange, onToggleStatus, onUpdateBalance, onDeleteUser, onAddBalance }: {
  users: User[]
  totalUsers: number
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  onToggleStatus: (id: string) => void
  onUpdateBalance: (id: string, balance: number) => void
  onDeleteUser: (id: string) => void
  onAddBalance: (id: string, amount: number) => void
}) {
  const [searchQuery, setSearchQuery]           = useState("")
  const [statusFilter, setStatusFilter]         = useState("all")
  const [selectedUser, setSelectedUser]         = useState<User | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog]     = useState(false)
  const [editBalance, setEditBalance]           = useState("")
  const [showAddDialog, setShowAddDialog]       = useState(false)
  const [addAmount, setAddAmount]               = useState("")

  const filtered = users.filter(u => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q ||
      String(u.telegram_id).includes(q) ||
      (u.first_name  ?? "").toLowerCase().includes(q) ||
      (u.last_name   ?? "").toLowerCase().includes(q) ||
      (u.username    ?? "").toLowerCase().includes(q)
    const matchStatus = statusFilter === "all" || u.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-10 bg-secondary/50" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 bg-secondary/50"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline"><Filter className="mr-2 h-4 w-4" />Filters</Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Referrals</TableHead>
                <TableHead>VIP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(user => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-secondary">
                          {userInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{userDisplayName(user)}</p>
                        <p className="text-xs text-muted-foreground">{userSubtitle(user)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">${user.balance.toFixed(2)}</TableCell>
                  <TableCell>{user.referrals}</TableCell>
                  <TableCell><Badge className="primary-gradient border-0">VIP {user.vip}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      user.status === "active"    && "border-green-500 text-green-400",
                      user.status === "suspended" && "border-destructive text-destructive"
                    )}>{user.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setAddAmount(""); setShowAddDialog(true) }}>
                          <PlusCircle className="mr-2 h-4 w-4 text-green-400" />Add Balance
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedUser(user); setEditBalance(user.balance.toString()); setShowEditDialog(true) }}>
                          <Eye className="mr-2 h-4 w-4" />Edit Balance
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleStatus(user.id)}>
                          {user.status === "active"
                            ? <><Ban className="mr-2 h-4 w-4" />Suspend</>
                            : <><UserCheck className="mr-2 h-4 w-4" />Activate</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedUser(user); setShowDeleteDialog(true) }}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Showing {filtered.length} of {totalUsers} users · Page {currentPage} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>← Previous</Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next →</Button>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>Are you sure you want to delete {selectedUser ? userDisplayName(selectedUser) : ""}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (selectedUser) { onDeleteUser(selectedUser.id); setShowDeleteDialog(false); setSelectedUser(null) } }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Balance</DialogTitle>
            <DialogDescription>Set exact balance for {selectedUser ? userDisplayName(selectedUser) : ""} (current: ${selectedUser?.balance.toFixed(2)})</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">New Balance (USDT)</label>
            <Input type="number" value={editBalance} onChange={e => setEditBalance(e.target.value)} className="mt-2" step="0.01" min="0" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button className="primary-gradient" onClick={() => { if (selectedUser && editBalance) { onUpdateBalance(selectedUser.id, parseFloat(editBalance)); setShowEditDialog(false) } }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-green-400" />Add Balance</DialogTitle>
            <DialogDescription>Credit USDT to <strong>{selectedUser ? userDisplayName(selectedUser) : ""}</strong> — current: <strong>${selectedUser?.balance.toFixed(2)}</strong></DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Amount to Add (USDT)</label>
              <Input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} className="mt-2 bg-secondary/50" step="0.01" min="0.01" placeholder="0.00" autoFocus />
            </div>
            {addAmount && parseFloat(addAmount) > 0 && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3">
                <p className="text-sm text-muted-foreground">New balance after credit:</p>
                <p className="text-xl font-bold text-green-400">${((selectedUser?.balance ?? 0) + parseFloat(addAmount)).toFixed(2)} USDT</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button className="primary-gradient" disabled={!addAmount || parseFloat(addAmount) <= 0}
              onClick={() => { if (selectedUser && addAmount && parseFloat(addAmount) > 0) { onAddBalance(selectedUser.id, parseFloat(addAmount)); setShowAddDialog(false); setAddAmount("") } }}>
              Add ${parseFloat(addAmount || "0").toFixed(2)} USDT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

function WithdrawalsContent({ withdrawals, onApprove, onReject }: {
  withdrawals: Withdrawal[]
  onApprove: (id: number) => void
  onReject: (id: number) => void
}) {
  const pending  = withdrawals.filter(w => w.status === "pending")
  const approved = withdrawals.filter(w => w.status === "approved")
  const rejected = withdrawals.filter(w => w.status === "rejected")

  const renderTable = (rows: Withdrawal[], showActions = false) => (
    <Card className="glass-card">
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No withdrawals</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Date</TableHead>
                {showActions && <TableHead className="text-right">Actions</TableHead>}
                {!showActions && <TableHead>Processed</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(w => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.user}</TableCell>
                  <TableCell>${Math.abs(w.amount).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{w.address}</TableCell>
                  <TableCell className="text-muted-foreground">{w.date}</TableCell>
                  {showActions ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="primary-gradient" onClick={() => onApprove(w.id)}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => onReject(w.id)}>
                          <XCircle className="mr-1 h-3 w-3" />Reject
                        </Button>
                      </div>
                    </TableCell>
                  ) : (
                    <TableCell className="text-muted-foreground">{w.processedAt || "-"}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pending">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending"  className="mt-4">{renderTable(pending,  true)}</TabsContent>
        <TabsContent value="approved" className="mt-4">{renderTable(approved, false)}</TabsContent>
        <TabsContent value="rejected" className="mt-4">{renderTable(rejected, false)}</TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function AnalyticsContent({ users, withdrawals }: { users: User[]; withdrawals: Withdrawal[] }) {
  const totalEarnings = users.reduce((s, u) => s + u.totalEarnings, 0)
  const totalVideos   = users.reduce((s, u) => s + u.videosWatched, 0)
  const totalPayouts  = withdrawals.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0)
  const avgBalance    = users.length > 0 ? users.reduce((s, u) => s + u.balance, 0) / users.length : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Users",       value: users.length.toString(),          sub: `${users.filter(u => u.status === "active").length} active` },
          { label: "Videos Watched",    value: totalVideos.toLocaleString(),     sub: "All time"       },
          { label: "Total Payouts",     value: `$${totalPayouts.toFixed(2)}`,   sub: `${withdrawals.filter(w => w.status === "approved").length} txns` },
          { label: "Avg Balance/User",  value: `$${avgBalance.toFixed(2)}`,     sub: "Current"        },
        ].map(s => (
          <Card key={s.label} className="glass-card">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-3xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-card">
        <CardHeader><CardTitle>Top Earners</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Videos</TableHead>
                <TableHead>Total Earnings</TableHead>
                <TableHead>VIP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.sort((a, b) => b.totalEarnings - a.totalEarnings).slice(0, 5).map((user, i) => (
                <TableRow key={user.id}>
                  <TableCell className="font-bold text-primary">#{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-secondary text-xs">
                          {userInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      {userDisplayName(user)}
                    </div>
                  </TableCell>
                  <TableCell>{user.videosWatched.toLocaleString()}</TableCell>
                  <TableCell className="text-green-400">${user.totalEarnings.toFixed(2)}</TableCell>
                  <TableCell><Badge className="primary-gradient border-0">VIP {user.vip}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Videos ───────────────────────────────────────────────────────────────────

interface VideoItem {
  id: string; title: string; company: string; youtube_url: string
  reward: number; duration: number; active: boolean; created_at: string
}

function VideosContent({ showNotification }: { showNotification: (t: "success"|"error", m: string) => void }) {
  const [videos, setVideos]           = useState<VideoItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [showAddDialog, setShowAdd]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState({ title: "", company: "", youtube_url: "", reward: "0.05", duration: "30" })

  const load = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/admin/videos", { credentials: "include" })
      const data = await res.json()
      if (data.videos) setVideos(data.videos)
    } catch { showNotification("error", "Failed to load videos") }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.youtube_url || !form.title) return
    setSaving(true)
    try {
      const res  = await fetch("/api/admin/videos", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) { showNotification("success", "Video added"); setForm({ title: "", company: "", youtube_url: "", reward: "0.05", duration: "30" }); setShowAdd(false); load() }
      else showNotification("error", data.error || "Failed")
    } catch { showNotification("error", "Failed to add video") }
    setSaving(false)
  }

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await fetch("/api/admin/videos", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active }) })
      setVideos(p => p.map(v => v.id === id ? { ...v, active } : v))
      showNotification("success", active ? "Video activated" : "Video paused")
    } catch { showNotification("error", "Failed to update") }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/admin/videos?id=${id}`, { method: "DELETE", credentials: "include" })
      setVideos(p => p.filter(v => v.id !== id))
      showNotification("success", "Video deleted")
    } catch { showNotification("error", "Failed to delete") }
  }

  const extractThumb = (url: string) => {
    try {
      const u = new URL(url); let vid = u.searchParams.get("v")
      if (!vid && u.hostname === "youtu.be") vid = u.pathname.slice(1)
      if (vid) return `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
    } catch {}
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Company Videos</h3>
          <p className="text-sm text-muted-foreground">{videos.filter(v => v.active).length} active · {videos.length} total</p>
        </div>
        <Button className="primary-gradient" onClick={() => setShowAdd(true)}>+ Add Video</Button>
      </div>

      {loading ? (
        <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : videos.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <PlayCircle className="h-14 w-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="font-medium mb-1">No videos yet</p>
            <Button className="primary-gradient mt-2" onClick={() => setShowAdd(true)}>+ Add First Video</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map(v => {
            const thumb = extractThumb(v.youtube_url)
            return (
              <Card key={v.id} className={cn("glass-card overflow-hidden", !v.active && "opacity-60")}>
                <div className="relative h-36 bg-secondary">
                  {thumb ? <img src={thumb} alt={v.title} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><PlayCircle className="h-10 w-10 text-muted-foreground/40" /></div>}
                  <div className="absolute bottom-2 right-2">
                    <Badge className={v.active ? "bg-green-500 text-white border-0" : "bg-secondary text-muted-foreground"}>{v.active ? "Active" : "Paused"}</Badge>
                  </div>
                </div>
                <CardContent className="p-4 space-y-2">
                  <p className="font-semibold line-clamp-1">{v.title}</p>
                  {v.company && <p className="text-xs text-muted-foreground">{v.company}</p>}
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-primary font-medium">+${v.reward.toFixed(2)} USDT</span>
                    <span className="text-muted-foreground">{v.duration}s</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleToggle(v.id, !v.active)}>{v.active ? "Pause" : "Activate"}</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Company Video</DialogTitle>
            <DialogDescription>Paste a YouTube link. Users will watch it and earn USDT.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Video Title *</label><Input placeholder="e.g. Crypto Exchange Tutorial" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="bg-secondary/50" required /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Company / Brand</label><Input placeholder="e.g. CoinEx" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">YouTube URL *</label><Input placeholder="https://youtube.com/watch?v=..." value={form.youtube_url} onChange={e => setForm(p => ({ ...p, youtube_url: e.target.value }))} className="bg-secondary/50" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><label className="text-sm font-medium">Reward (USDT)</label><Input type="number" step="0.01" min="0" value={form.reward} onChange={e => setForm(p => ({ ...p, reward: e.target.value }))} className="bg-secondary/50" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Duration (sec)</label><Input type="number" min="5" value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} className="bg-secondary/50" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" className="primary-gradient" disabled={saving || !form.youtube_url || !form.title}>{saving ? "Saving..." : "Add Video"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Ad Networks ──────────────────────────────────────────────────────────────

function AdNetworksContent() {
  const [activeNetwork, setActiveNetwork]     = useState<string | null>(null)
  const [networkStatuses, setNetworkStatuses] = useState<Record<string, boolean>>({})
  const [fieldValues, setFieldValues]         = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving]                   = useState<string | null>(null)
  const [setupSql, setSetupSql]               = useState<string | null>(null)
  const [isLoadingNets, setIsLoadingNets]     = useState(true)

  useEffect(() => {
    fetch("/api/admin/ad-networks", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.configs) {
          const statuses: Record<string, boolean> = {}
          const values: Record<string, Record<string, string>> = {}
          for (const [id, cfg] of Object.entries(d.configs)) {
            statuses[id] = true
            values[id] = cfg as Record<string, string>
          }
          setNetworkStatuses(statuses)
          setFieldValues(values)
        }
        if (d.error === "setup_required") setSetupSql(d.sql)
      })
      .catch(() => {})
      .finally(() => setIsLoadingNets(false))
  }, [])

  const handleConnect = async (networkId: string) => {
    setSaving(networkId)
    const res = await fetch("/api/admin/ad-networks", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ networkId, fields: fieldValues[networkId] || {}, connected: true }),
    })
    const d = await res.json()
    if (d.success) setNetworkStatuses(prev => ({ ...prev, [networkId]: true }))
    if (d.error === "setup_required") setSetupSql(d.sql)
    setSaving(null)
  }

  const handleDisconnect = async (networkId: string) => {
    setSaving(networkId)
    await fetch("/api/admin/ad-networks", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ networkId, connected: false }),
    })
    setNetworkStatuses(prev => ({ ...prev, [networkId]: false }))
    setSaving(null)
  }

  const setField = (networkId: string, fieldKey: string, value: string) =>
    setFieldValues(prev => ({ ...prev, [networkId]: { ...prev[networkId], [fieldKey]: value } }))

  const adNetworks = [
    {
      id: "admob", name: "Google AdMob", logo: "🟢",
      description: "Rewarded video ads from Google",
      fields: [
        { key: "appId",              label: "App ID",                placeholder: "ca-app-pub-xxxxx~xxxxx"  },
        { key: "rewardedUnitId",     label: "Rewarded Ad Unit ID",   placeholder: "ca-app-pub-xxxxx/xxxxx"  },
        { key: "interstitialUnitId", label: "Interstitial Ad Unit ID", placeholder: "ca-app-pub-xxxxx/xxxxx" },
      ],
    },
    {
      id: "unity", name: "Unity Ads", logo: "🎮",
      description: "High eCPM rewarded video ads",
      fields: [
        { key: "gameId",                  label: "Game ID",                   placeholder: "1234567"        },
        { key: "rewardedPlacementId",     label: "Rewarded Placement ID",     placeholder: "rewardedVideo"  },
        { key: "interstitialPlacementId", label: "Interstitial Placement ID", placeholder: "video"          },
      ],
    },
    {
      id: "applovin", name: "AppLovin MAX", logo: "🔷",
      description: "Mediation platform with high fill rate",
      fields: [
        { key: "sdkKey",               label: "SDK Key",               placeholder: "xxxxx-xxxxx-xxxxx" },
        { key: "rewardedAdUnitId",     label: "Rewarded Ad Unit ID",   placeholder: "xxxxx"             },
        { key: "interstitialAdUnitId", label: "Interstitial Ad Unit ID", placeholder: "xxxxx"           },
        { key: "bannerAdUnitId",       label: "Banner Ad Unit ID",     placeholder: "xxxxx"             },
      ],
    },
    {
      id: "ironsource", name: "ironSource", logo: "🟠",
      description: "Full mediation with offerwall support",
      fields: [
        { key: "appKey",                  label: "App Key",                   placeholder: "xxxxxxx"              },
        { key: "rewardedPlacementName",   label: "Rewarded Placement Name",   placeholder: "DefaultRewardedVideo" },
        { key: "offerwallPlacementName",  label: "Offerwall Placement Name",  placeholder: "DefaultOfferWall"     },
      ],
    },
    {
      id: "facebook", name: "Meta Audience Network", logo: "🔵",
      description: "Facebook rewarded video ads",
      fields: [
        { key: "appId",                   label: "App ID",                    placeholder: "xxxxx"       },
        { key: "rewardedPlacementId",     label: "Rewarded Placement ID",     placeholder: "xxxxx_xxxxx" },
        { key: "interstitialPlacementId", label: "Interstitial Placement ID", placeholder: "xxxxx_xxxxx" },
      ],
    },
    {
      id: "vungle", name: "Vungle", logo: "🟣",
      description: "Premium video ads network",
      fields: [
        { key: "appId",                   label: "App ID",                    placeholder: "xxxxx"          },
        { key: "rewardedPlacementId",     label: "Rewarded Placement ID",     placeholder: "REWARDED-xxxxx" },
        { key: "interstitialPlacementId", label: "Interstitial Placement ID", placeholder: "INTER-xxxxx"    },
      ],
    },
    {
      id: "chartboost", name: "Chartboost", logo: "📊",
      description: "Gaming-focused ad network",
      fields: [
        { key: "appId",            label: "App ID",           placeholder: "xxxxx"   },
        { key: "appSignature",     label: "App Signature",    placeholder: "xxxxx"   },
        { key: "rewardedLocation", label: "Rewarded Location", placeholder: "Default" },
      ],
    },
    {
      id: "mintegral", name: "Mintegral", logo: "🟡",
      description: "Global ad network with AI optimization",
      fields: [
        { key: "appId",          label: "App ID",          placeholder: "xxxxx" },
        { key: "appKey",         label: "App Key",         placeholder: "xxxxx" },
        { key: "rewardedUnitId", label: "Rewarded Unit ID", placeholder: "xxxxx" },
      ],
    },
    {
      id: "monetag", name: "Monetag", logo: "💰",
      description: "Multi-format ads: Push, Popunder, Interstitial",
      fields: [
        { key: "siteId",             label: "Site ID",             placeholder: "xxxxx" },
        { key: "pushZoneId",         label: "Push Zone ID",         placeholder: "xxxxx" },
        { key: "popunderZoneId",     label: "Popunder Zone ID",     placeholder: "xxxxx" },
        { key: "interstitialZoneId", label: "Interstitial Zone ID", placeholder: "xxxxx" },
        { key: "rewardedZoneId",     label: "Rewarded Zone ID",     placeholder: "xxxxx" },
      ],
    },
  ]

  const connectedCount = Object.values(networkStatuses).filter(Boolean).length

  return (
    <div className="space-y-6">
      {setupSql && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 space-y-2">
          <p className="text-sm font-medium text-yellow-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Database table missing. Run this SQL in your Supabase SQL Editor to enable saving:
          </p>
          <pre className="text-xs bg-secondary/80 p-3 rounded overflow-auto text-foreground whitespace-pre-wrap">{setupSql}</pre>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(setupSql!)}>
            Copy SQL
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ad Networks Integration</h3>
          <p className="text-sm text-muted-foreground">Connect your ad networks to monetize video views</p>
        </div>
        {isLoadingNets ? (
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Loading...</Badge>
        ) : (
          <Badge variant="outline" className={connectedCount > 0 ? "border-green-500 text-green-400" : "border-muted-foreground text-muted-foreground"}>
            {connectedCount} Connected
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {adNetworks.map((network) => {
          const isConnected = networkStatuses[network.id] ?? false
          return (
            <Card
              key={network.id}
              className={cn(
                "glass-card cursor-pointer transition-all hover:border-primary/50",
                activeNetwork === network.id && "border-primary ring-1 ring-primary/50"
              )}
              onClick={() => setActiveNetwork(activeNetwork === network.id ? null : network.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-2xl">
                      {network.logo}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{network.name}</h4>
                      <p className="text-xs text-muted-foreground">{network.description}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      isConnected  && "border-green-500 text-green-400",
                      !isConnected && "border-muted-foreground text-muted-foreground"
                    )}
                  >
                    {isConnected ? "connected" : "disconnected"}
                  </Badge>
                </div>

                {activeNetwork === network.id && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    {network.fields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <Input
                          placeholder={field.placeholder}
                          value={fieldValues[network.id]?.[field.key] ?? ""}
                          onChange={(e) => { e.stopPropagation(); setField(network.id, field.key, e.target.value) }}
                          className="h-9 bg-secondary/50 font-mono text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-2">
                      <Button
                        className="primary-gradient flex-1"
                        size="sm"
                        disabled={saving === network.id}
                        onClick={(e) => { e.stopPropagation(); handleConnect(network.id) }}
                      >
                        {saving === network.id ? "Saving..." : isConnected ? "Update" : "Connect"}
                      </Button>
                      {isConnected && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/10"
                          disabled={saving === network.id}
                          onClick={(e) => { e.stopPropagation(); handleDisconnect(network.id) }}
                        >
                          Disconnect
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ad Mediation Priority */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Ad Mediation Priority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drag to reorder ad networks by priority. Higher priority networks will be called first.
          </p>
          <div className="space-y-2">
            {adNetworks
              .filter((n) => networkStatuses[n.id])
              .map((network, index) => (
                <div
                  key={network.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                    <span className="text-lg">{network.logo}</span>
                    <span className="font-medium text-foreground">{network.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">Active</span>
                    <span className="text-sm text-green-400">Connected</span>
                  </div>
                </div>
              ))}
            {connectedCount === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No ad networks connected yet. Connect at least one network above.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video Watch Limits */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Video Watch Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Control how many videos users can watch daily based on their VIP level
          </p>
          <div className="space-y-4">
            {[
              { level: 0, label: "Free Users",  sub: "No VIP subscription", default: "20",  cls: "border-border bg-secondary/30",    numCls: "bg-muted text-foreground"                               },
              { level: 1, label: "VIP Level 1", sub: "Bronze membership",   default: "50",  cls: "border-primary/30 bg-primary/5",   numCls: "bg-primary/20 text-primary"                             },
              { level: 2, label: "VIP Level 2", sub: "Silver membership",   default: "100", cls: "border-primary/30 bg-primary/5",   numCls: "bg-primary/30 text-primary"                             },
              { level: 3, label: "VIP Level 3", sub: "Gold membership",     default: "200", cls: "border-primary/50 bg-primary/10",  numCls: "primary-gradient text-background font-bold"             },
              { level: 4, label: "VIP Level 4", sub: "Diamond membership",  default: "500", cls: "border-primary bg-primary/20",     numCls: "primary-gradient text-background font-bold animate-pulse"},
            ].map(row => (
              <div key={row.level} className={`flex items-center justify-between rounded-lg border p-4 ${row.cls}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${row.numCls}`}>
                    {row.level}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.sub}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input defaultValue={row.default} className="w-20 bg-secondary/50 text-center" />
                  <span className="text-sm text-muted-foreground">videos/day</span>
                </div>
              </div>
            ))}
          </div>
          <Button className="primary-gradient">Save Video Limits</Button>
        </CardContent>
      </Card>

      {/* Reward Configuration */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Reward Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reward per Video (USDT)</label>
              <Input defaultValue="0.05" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Max Daily Earnings (USDT)</label>
              <Input defaultValue="25.00" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cooldown Between Videos (sec)</label>
              <Input defaultValue="30" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Minimum Watch Time (%)</label>
              <Input defaultValue="90" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">VIP Bonus Multiplier</label>
              <Input defaultValue="1.5x" className="bg-secondary/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reset Time (UTC)</label>
              <Input defaultValue="00:00" type="time" className="bg-secondary/50" />
            </div>
          </div>
          <Button className="primary-gradient">Save Reward Settings</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsContent({ settings, onUpdateSettings, onChangePassword }: {
  settings: AppSettings
  onUpdateSettings: (s: Partial<AppSettings>) => void
  onChangePassword: (current: string, newPass: string) => Promise<{ ok: boolean; sql?: string }>
}) {
  const [localSettings, setLocalSettings] = useState(settings)
  const [isSaving, setIsSaving]           = useState(false)
  const [currentPwd, setCurrentPwd]       = useState("")
  const [newPwd, setNewPwd]               = useState("")
  const [confirmPwd, setConfirmPwd]       = useState("")
  const [pwdError, setPwdError]           = useState("")
  const [pwdSaving, setPwdSaving]         = useState(false)
  const [pwdSuccess, setPwdSuccess]       = useState(false)
  const [pwdSetupSql, setPwdSetupSql]     = useState<string | null>(null)

  const [depositAddresses, setDepositAddresses] = useState({ tron: "", eth: "", bsc: "" })
  const [addrSaving, setAddrSaving]             = useState(false)
  const [addrMsg, setAddrMsg]                   = useState<{ type: "success"|"error"; text: string }|null>(null)

  const [nowpaymentsKey,       setNowpaymentsKey]       = useState("")
  const [nowpaymentsIpnSecret, setNowpaymentsIpnSecret] = useState("")
  const [nowpaymentsSaving,    setNowpaymentsSaving]    = useState(false)
  const [nowpaymentsMsg,       setNowpaymentsMsg]       = useState<{ type: "success"|"error"; text: string }|null>(null)

  const DEFAULT_VIP_PLANS = [
    { level: 0, name: "Free",     price: 0,    bonus: "1%"  },
    { level: 1, name: "Bronze",   price: 50,   bonus: "5%"  },
    { level: 2, name: "Silver",   price: 150,  bonus: "10%" },
    { level: 3, name: "Gold",     price: 500,  bonus: "20%" },
    { level: 4, name: "Platinum", price: 1000, bonus: "35%" },
    { level: 5, name: "Diamond",  price: 2000, bonus: "50%" },
  ]
  const DEFAULT_RATES = {
    basic:    { daily_rate: 0.01,  min_vip: 0 },
    silver:   { daily_rate: 0.02,  min_vip: 1 },
    gold:     { daily_rate: 0.035, min_vip: 2 },
    diamond:  { daily_rate: 0.05,  min_vip: 3 },
    ultimate: { daily_rate: 0.07,  min_vip: 4 },
  }

  const [vipPlans, setVipPlans]           = useState(DEFAULT_VIP_PLANS)
  const [vipPlansSaving, setVipSaving]    = useState(false)
  const [vipPlansMsg, setVipMsg]          = useState<{ type: "success"|"error"; text: string }|null>(null)
  const [miningRates, setMiningRates]     = useState(DEFAULT_RATES)
  const [miningRatesSaving, setMinSaving] = useState(false)
  const [miningRatesMsg, setMinMsg]       = useState<{ type: "success"|"error"; text: string }|null>(null)

  useEffect(() => {
    fetch("/api/admin/settings",      { credentials: "include" }).then(r => r.json()).then(d => {
      if (d.settings)          setLocalSettings(p => ({ ...p, ...d.settings }))
      if (d.depositAddresses)  setDepositAddresses(p => ({ ...p, ...d.depositAddresses }))
      if (d.nowpayments?.apiKey)       setNowpaymentsKey(d.nowpayments.apiKey)
      if (d.nowpayments?.ipnSecret)    setNowpaymentsIpnSecret(d.nowpayments.ipnSecret)
    }).catch(() => {})
    fetch("/api/admin/vip-config",    { credentials: "include" }).then(r => r.json()).then(d => { if (d.plans) setVipPlans(d.plans) }).catch(() => {})
    fetch("/api/admin/mining-config", { credentials: "include" }).then(r => r.json()).then(d => { if (d.rates) setMiningRates(p => ({ ...p, ...d.rates })) }).catch(() => {})
  }, [])

  const handleSaveNowpayments = async () => {
    setNowpaymentsSaving(true); setNowpaymentsMsg(null)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nowpayments: { apiKey: nowpaymentsKey, ipnSecret: nowpaymentsIpnSecret } }),
      })
      const d = await res.json()
      setNowpaymentsMsg(d.success ? { type: "success", text: "NOWPayments settings saved!" } : { type: "error", text: d.error ?? "Failed" })
    } catch { setNowpaymentsMsg({ type: "error", text: "Network error" }) }
    setNowpaymentsSaving(false); setTimeout(() => setNowpaymentsMsg(null), 3000)
  }

  const handleSaveDepositAddresses = async () => {
    setAddrSaving(true); setAddrMsg(null)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositAddresses }),
      })
      const d = await res.json()
      setAddrMsg(d.success ? { type: "success", text: "Deposit addresses saved!" } : { type: "error", text: d.error ?? "Failed" })
    } catch { setAddrMsg({ type: "error", text: "Network error" }) }
    setAddrSaving(false); setTimeout(() => setAddrMsg(null), 3000)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setPwdError(""); setPwdSuccess(false); setPwdSetupSql(null)
    if (newPwd.length < 6) { setPwdError("Minimum 6 characters"); return }
    if (newPwd !== confirmPwd) { setPwdError("Passwords do not match"); return }
    setPwdSaving(true)
    const result = await onChangePassword(currentPwd, newPwd)
    setPwdSaving(false)
    if (result.ok) { setPwdSuccess(true); setCurrentPwd(""); setNewPwd(""); setConfirmPwd("") }
    else if (result.sql) { setPwdSetupSql(result.sql) }
    else { setPwdError("Failed — check your current password") }
  }

  const handleSaveGeneral = async () => {
    setIsSaving(true)
    const patch = { minWithdrawal: localSettings.minWithdrawal, dailyVideoLimit: localSettings.dailyVideoLimit, referralCommission: localSettings.referralCommission }
    try { await fetch("/api/admin/settings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); onUpdateSettings(patch) } catch {}
    setIsSaving(false)
  }

  const handleSaveRewards = async () => {
    setIsSaving(true)
    const patch = {
      rewardPerVideo:    localSettings.rewardPerVideo,
      maxDailyEarnings:  localSettings.maxDailyEarnings,
      cooldownSeconds:   localSettings.cooldownSeconds,
      minWatchPercent:   localSettings.minWatchPercent,
      vipMultiplier:     localSettings.vipMultiplier,
      spinDailyLimit:    localSettings.spinDailyLimit,
      maxDailyAds:       localSettings.maxDailyAds,
      rewardPerAd:       localSettings.rewardPerAd,
      adCooldownSeconds: localSettings.adCooldownSeconds,
    }
    try { await fetch("/api/admin/settings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: patch }) }); onUpdateSettings(patch) } catch {}
    setIsSaving(false)
  }

  const handleSaveVipPlans = async () => {
    setVipSaving(true); setVipMsg(null)
    try {
      const res = await fetch("/api/admin/vip-config", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plans: vipPlans }) })
      const d = await res.json()
      setVipMsg(d.success ? { type: "success", text: "VIP plans saved!" } : { type: "error", text: d.error ?? "Failed" })
    } catch { setVipMsg({ type: "error", text: "Network error" }) }
    setVipSaving(false); setTimeout(() => setVipMsg(null), 3000)
  }

  const handleSaveMiningRates = async () => {
    setMinSaving(true); setMinMsg(null)
    try {
      const res = await fetch("/api/admin/mining-config", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rates: miningRates }) })
      const d = await res.json()
      setMinMsg(d.success ? { type: "success", text: "Mining rates saved!" } : { type: "error", text: d.error ?? "Failed" })
    } catch { setMinMsg({ type: "error", text: "Network error" }) }
    setMinSaving(false); setTimeout(() => setMinMsg(null), 3000)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="glass-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />Change Admin Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Current Password</label><Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} className="bg-secondary/50" placeholder="Enter current password" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">New Password</label><Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="bg-secondary/50" placeholder="Minimum 6 characters" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Confirm New Password</label><Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} className="bg-secondary/50" placeholder="Repeat new password" /></div>
            {pwdError   && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{pwdError}</p>}
            {pwdSuccess && <p className="text-sm text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Password changed successfully!</p>}
            {pwdSetupSql && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 space-y-2">
                <p className="text-sm font-medium text-yellow-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Run this SQL in Supabase SQL Editor:</p>
                <pre className="text-xs bg-secondary/80 p-3 rounded overflow-auto whitespace-pre-wrap">{pwdSetupSql}</pre>
                <Button size="sm" variant="outline" type="button" onClick={() => navigator.clipboard.writeText(pwdSetupSql!)}>Copy SQL</Button>
              </div>
            )}
            <Button type="submit" className="primary-gradient" disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}>{pwdSaving ? "Saving..." : "Change Password"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><label className="text-sm font-medium">Minimum Withdrawal (USDT)</label><Input type="number" value={localSettings.minWithdrawal} onChange={e => setLocalSettings(p => ({ ...p, minWithdrawal: parseFloat(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Daily Video Limit</label><Input type="number" value={localSettings.dailyVideoLimit} onChange={e => setLocalSettings(p => ({ ...p, dailyVideoLimit: parseInt(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Referral Commission (%)</label><Input type="number" value={localSettings.referralCommission} onChange={e => setLocalSettings(p => ({ ...p, referralCommission: parseFloat(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
          <Button className="primary-gradient" onClick={handleSaveGeneral} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle>Reward Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><label className="text-sm font-medium">Reward per Video (USDT)</label><Input type="number" step="0.01" value={localSettings.rewardPerVideo} onChange={e => setLocalSettings(p => ({ ...p, rewardPerVideo: parseFloat(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Max Daily Earnings (USDT)</label><Input type="number" value={localSettings.maxDailyEarnings} onChange={e => setLocalSettings(p => ({ ...p, maxDailyEarnings: parseFloat(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Cooldown (sec)</label><Input type="number" value={localSettings.cooldownSeconds} onChange={e => setLocalSettings(p => ({ ...p, cooldownSeconds: parseInt(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Min Watch Time (%)</label><Input type="number" value={localSettings.minWatchPercent} onChange={e => setLocalSettings(p => ({ ...p, minWatchPercent: parseInt(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">VIP Bonus Multiplier</label><Input type="number" step="0.1" value={localSettings.vipMultiplier} onChange={e => setLocalSettings(p => ({ ...p, vipMultiplier: parseFloat(e.target.value) || 1 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Daily Spin Limit</label><Input type="number" value={localSettings.spinDailyLimit} onChange={e => setLocalSettings(p => ({ ...p, spinDailyLimit: parseInt(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
          </div>
          <Button className="primary-gradient" onClick={handleSaveRewards} disabled={isSaving}>{isSaving ? "Saving..." : "Save Reward Settings"}</Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle>📺 Watch & Earn Ads Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Configure daily ad limits, cooldowns, and rewards for the Watch & Earn feature.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><label className="text-sm font-medium">Max Ads Per Day</label><Input type="number" min="1" value={localSettings.maxDailyAds} onChange={e => setLocalSettings(p => ({ ...p, maxDailyAds: parseInt(e.target.value) || 1 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Reward Per Ad (USDT)</label><Input type="number" step="0.001" min="0" value={localSettings.rewardPerAd} onChange={e => setLocalSettings(p => ({ ...p, rewardPerAd: parseFloat(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Cooldown Between Ads (sec)</label><Input type="number" min="0" value={localSettings.adCooldownSeconds} onChange={e => setLocalSettings(p => ({ ...p, adCooldownSeconds: parseInt(e.target.value) || 0 }))} className="bg-secondary/50" /></div>
          </div>
          <Button className="primary-gradient" onClick={handleSaveRewards} disabled={isSaving}>{isSaving ? "Saving..." : "Save Ad Settings"}</Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle>👑 VIP Plans Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Set the price and earning bonus for each VIP level.</p>
          {vipPlans.map((plan, idx) => (
            <div key={plan.level} className="grid grid-cols-3 gap-3 items-end rounded-xl bg-secondary/30 p-3">
              <div>
                <label className="text-sm font-medium">VIP {plan.level} — {plan.name}</label>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.level === 0 ? "Default (free)" : "Upgrade tier"}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Price (USDT)</label>
                <Input type="number" min="0" step="1" value={plan.price} disabled={plan.level === 0}
                  onChange={e => setVipPlans(p => p.map((x, i) => i === idx ? { ...x, price: parseFloat(e.target.value) || 0 } : x))}
                  className="bg-secondary/50 w-full" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Bonus (%)</label>
                <Input type="text" value={plan.bonus.replace("%", "")}
                  onChange={e => setVipPlans(p => p.map((x, i) => i === idx ? { ...x, bonus: `${e.target.value}%` } : x))}
                  className="bg-secondary/50 w-full" placeholder="e.g. 5" />
              </div>
            </div>
          ))}
          {vipPlansMsg && <p className={`text-sm flex items-center gap-1 ${vipPlansMsg.type === "success" ? "text-green-400" : "text-destructive"}`}>{vipPlansMsg.type === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{vipPlansMsg.text}</p>}
          <Button className="primary-gradient" onClick={handleSaveVipPlans} disabled={vipPlansSaving}>{vipPlansSaving ? "Saving..." : "Save VIP Plans"}</Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle>⛏️ Mining Rates Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Configure daily mining profit percentages for each plan.</p>
          {(["basic","silver","gold","diamond","ultimate"] as const).map(plan => {
            const labels: Record<string, string> = {
              basic: "⚡ Basic (VIP 0+)", silver: "🥈 Silver (VIP 1+)",
              gold: "🥇 Gold (VIP 2+)", diamond: "💎 Diamond (VIP 3+)", ultimate: "🚀 Ultimate (VIP 4+)",
            }
            const r = miningRates[plan]
            return (
              <div key={plan} className="grid grid-cols-2 gap-3 items-end rounded-xl bg-secondary/30 p-3">
                <div>
                  <label className="text-sm font-medium">{labels[plan]}</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Min VIP: {r.min_vip}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Daily Rate (%)</label>
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.1" min="0" max="50"
                      value={(r.daily_rate * 100).toFixed(1)}
                      onChange={e => setMiningRates(p => ({ ...p, [plan]: { ...p[plan], daily_rate: parseFloat(e.target.value) / 100 || 0 } }))}
                      className="bg-secondary/50 w-24" />
                    <span className="text-sm text-muted-foreground">%/day</span>
                  </div>
                </div>
              </div>
            )
          })}
          {miningRatesMsg && <p className={`text-sm flex items-center gap-1 ${miningRatesMsg.type === "success" ? "text-green-400" : "text-destructive"}`}>{miningRatesMsg.type === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{miningRatesMsg.text}</p>}
          <Button className="primary-gradient" onClick={handleSaveMiningRates} disabled={miningRatesSaving}>{miningRatesSaving ? "Saving..." : "Save Mining Rates"}</Button>
        </CardContent>
      </Card>

      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            NOWPayments Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <p className="text-sm text-blue-300 font-medium mb-1">🚀 Automatic Deposit &amp; Withdrawal</p>
            <p className="text-xs text-blue-400">
              When configured, deposits are verified automatically via blockchain and withdrawals are sent instantly without manual processing.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              NOWPayments API Key
              <a href="https://nowpayments.io" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Get key →</a>
            </label>
            <Input
              type="password"
              placeholder="Enter your NOWPayments API Key"
              value={nowpaymentsKey}
              onChange={e => setNowpaymentsKey(e.target.value)}
              className="bg-secondary/50 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">IPN Secret (Webhook Signature)</label>
            <Input
              type="password"
              placeholder="From NOWPayments → IPN Settings"
              value={nowpaymentsIpnSecret}
              onChange={e => setNowpaymentsIpnSecret(e.target.value)}
              className="bg-secondary/50 font-mono text-sm"
            />
          </div>

          <div className="rounded-lg bg-secondary/40 p-3 space-y-1">
            <p className="text-xs font-medium text-foreground">Webhook URL (add in NOWPayments dashboard)</p>
            <code className="text-xs text-primary break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/nowpayments` : "/api/webhooks/nowpayments"}
            </code>
          </div>

          {nowpaymentsMsg && (
            <p className={`text-sm flex items-center gap-1 ${nowpaymentsMsg.type === "success" ? "text-green-400" : "text-destructive"}`}>
              {nowpaymentsMsg.type === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {nowpaymentsMsg.text}
            </p>
          )}
          <Button className="primary-gradient" onClick={handleSaveNowpayments} disabled={nowpaymentsSaving}>
            {nowpaymentsSaving ? "Saving..." : "Save NOWPayments Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            Fallback Deposit Addresses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Used as fallback when NOWPayments is not configured. Users will copy these addresses manually.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">₮</span>
              USDT — TRC20 (Tron Network)
            </label>
            <Input
              placeholder="T..."
              value={depositAddresses.tron}
              onChange={e => setDepositAddresses(p => ({ ...p, tron: e.target.value }))}
              className="bg-secondary/50 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">₮</span>
              USDT — ERC20 (Ethereum Network)
            </label>
            <Input
              placeholder="0x..."
              value={depositAddresses.eth}
              onChange={e => setDepositAddresses(p => ({ ...p, eth: e.target.value }))}
              className="bg-secondary/50 font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-white">₮</span>
              USDT — BEP20 (BNB Smart Chain)
            </label>
            <Input
              placeholder="0x..."
              value={depositAddresses.bsc}
              onChange={e => setDepositAddresses(p => ({ ...p, bsc: e.target.value }))}
              className="bg-secondary/50 font-mono text-sm"
            />
          </div>

          {addrMsg && (
            <p className={`text-sm flex items-center gap-1 ${addrMsg.type === "success" ? "text-green-400" : "text-destructive"}`}>
              {addrMsg.type === "success" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {addrMsg.text}
            </p>
          )}
          <Button className="primary-gradient" onClick={handleSaveDepositAddresses} disabled={addrSaving}>
            {addrSaving ? "Saving..." : "Save Deposit Addresses"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Live Feed ─────────────────────────────────────────────────────────────────

interface LiveEvent {
  id:        string
  event:     string
  userId?:   string
  amount?:   number
  status?:   string
  txId?:     string
  time:      Date
}

function LiveFeedContent() {
  const [events, setEvents]   = useState<LiveEvent[]>([])
  const [isLive, setIsLive]   = useState(false)
  const [paused, setPaused]   = useState(false)
  const feedRef               = useRef<HTMLDivElement>(null)
  const pausedRef             = useRef(paused)
  pausedRef.current           = paused

  useEffect(() => {
    let channel:  any = null
    let supabase: any = null
    let cancelled     = false

    ;(async () => {
      try {
        const { createClient } = await import("@supabase/supabase-js")
        if (cancelled) return

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) return

        supabase = createClient(url, key, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        const push = (event: string, payload: Record<string, unknown>) => {
          if (pausedRef.current) return
          const ev: LiveEvent = {
            id:      `${Date.now()}_${Math.random()}`,
            event,
            userId:  payload.userId as string | undefined,
            amount:  payload.amount !== undefined ? Number(payload.amount) : undefined,
            status:  payload.status as string | undefined,
            txId:    (payload.txId ?? payload.id) as string | undefined,
            time:    new Date(),
          }
          setEvents(prev => [ev, ...prev].slice(0, 100))
          setTimeout(() => { feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }, 50)
        }

        channel = supabase.channel("admin:live")
          .on("broadcast", { event: "transaction_new"    }, ({ payload }: any) => push("transaction_new",    payload ?? {}))
          .on("broadcast", { event: "transaction_update" }, ({ payload }: any) => push("transaction_update", payload ?? {}))
          .on("broadcast", { event: "deposit_confirmed"  }, ({ payload }: any) => push("deposit_confirmed",  payload ?? {}))
          .on("broadcast", { event: "deposit_pending"    }, ({ payload }: any) => push("deposit_pending",    payload ?? {}))
          .on("broadcast", { event: "withdraw_pending"   }, ({ payload }: any) => push("withdraw_pending",   payload ?? {}))
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED")   setIsLive(true)
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setIsLive(false)
          })
      } catch {
        setIsLive(false)
      }
    })()

    return () => {
      cancelled = true
      setIsLive(false)
      if (supabase && channel) supabase.removeChannel(channel).catch(() => {})
    }
  }, [])

  const eventMeta: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    transaction_new:    { label: "New Transaction",     color: "text-blue-400 bg-blue-500/10 border-blue-500/20",      icon: <ArrowDownToLine size={13} /> },
    transaction_update: { label: "Transaction Updated", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: <RefreshCw size={13} />      },
    deposit_confirmed:  { label: "Deposit Confirmed ✓", color: "text-green-400 bg-green-500/10 border-green-500/20",   icon: <CheckCircle2 size={13} />   },
    deposit_pending:    { label: "Deposit Pending",     color: "text-orange-400 bg-orange-500/10 border-orange-500/20",icon: <Circle size={13} />         },
    withdraw_pending:   { label: "Withdraw Request",    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",icon: <ArrowUpFromLine size={13} /> },
  }

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Live Transaction Feed</h3>
          <p className="text-sm text-muted-foreground">Real-time events via Supabase Realtime</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            isLive
              ? "bg-green-500/10 text-green-400 border-green-500/30"
              : "bg-secondary text-muted-foreground border-border"
          }`}>
            {isLive
              ? <><span className="relative flex h-2 w-2 mr-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span> Connected</>
              : <><Circle size={8} className="mr-1" /> Disconnected</>
            }
          </div>
          <Button size="sm" variant="outline" onClick={() => setPaused(p => !p)}>
            {paused ? "▶ Resume" : "⏸ Pause"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEvents([])}>Clear</Button>
        </div>
      </div>

      {!isLive && (
        <Card className="glass-card border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-300">Not connected to Supabase Realtime</p>
              <p className="text-xs text-muted-foreground mt-1">
                Set <code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
                enable live event streaming. Once connected, deposits, withdrawals, and all wallet
                mutations will appear here in real time.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Event Stream
            <Badge variant="secondary" className="ml-auto">{events.length} events</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={feedRef} className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">
                  {isLive
                    ? "Waiting for events… Trigger a deposit or withdrawal to see live data."
                    : "Connect to Supabase Realtime to start receiving events."}
                </p>
              </div>
            ) : events.map(ev => {
              const meta = eventMeta[ev.event] ?? {
                label: ev.event,
                color: "text-gray-400 bg-gray-500/10 border-gray-500/20",
                icon:  <Circle size={13} />,
              }
              return (
                <div key={ev.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${meta.color}`}>
                  <div className="mt-0.5 flex-shrink-0">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{meta.label}</span>
                      <span className="text-[10px] opacity-60 flex-shrink-0">{fmtTime(ev.time)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 opacity-80">
                      {ev.userId && <span>User: <code className="opacity-70">{ev.userId.slice(0, 8)}…</code></span>}
                      {ev.amount !== undefined && <span>Amount: <strong>${Math.abs(ev.amount).toFixed(2)}</strong></span>}
                      {ev.status && <span>Status: <strong>{ev.status}</strong></span>}
                      {ev.txId && <span>TX: <code className="opacity-70">{ev.txId.slice(0, 8)}…</code></span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">How it works:</strong> Every wallet mutation
            (deposit, withdrawal, spin, bonus) broadcasts to the{" "}
            <code className="bg-secondary px-1 rounded">admin:live</code> Supabase Realtime channel.
            The feed is receive-only — it cannot affect user data.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
