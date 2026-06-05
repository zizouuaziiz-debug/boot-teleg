"use client";

import { useState, useRef, useEffect, useCallback } from "react"
import { Crown, Settings, Bell, Shield, HelpCircle, LogOut, ChevronRight, Moon, X, Camera, Check, Eye, EyeOff, MessageCircle, FileText, AlertCircle, Wallet, Sparkles, Diamond, Star, TrendingUp, Users, Copy } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useUser } from "@/context/user-context"

const DEFAULT_VIP_LEVELS = [
  { level: 0, name: "Free",     bonus: "1%",  price: 0,    color: "from-gray-500 to-gray-600", dot: "bg-gray-400" },
  { level: 1, name: "Bronze",   bonus: "5%",  price: 50,   color: "from-amber-600 to-orange-700", dot: "bg-amber-500" },
  { level: 2, name: "Silver",   bonus: "10%", price: 150,  color: "from-gray-300 to-slate-400", dot: "bg-gray-300" },
  { level: 3, name: "Gold",     bonus: "20%", price: 500,  color: "from-yellow-400 to-amber-500", dot: "bg-yellow-400" },
  { level: 4, name: "Platinum", bonus: "35%", price: 1000, color: "from-cyan-400 to-blue-500", dot: "bg-cyan-400" },
  { level: 5, name: "Diamond",  bonus: "50%", price: 2000, color: "from-purple-500 to-pink-500", dot: "bg-purple-400" },
]

const faqItems = [
  { question: "How do I earn USDT?", answer: "Watch videos, complete daily tasks, participate in the lucky wheel, and invite friends to earn USDT rewards." },
  { question: "What is the minimum withdrawal?", answer: "The minimum withdrawal amount is $10 USDT. Withdrawals are processed within 24-48 hours." },
  { question: "How does the referral program work?", answer: "Share your referral code with friends. When they sign up and start earning, you receive a percentage of their earnings based on your VIP level." },
  { question: "How do I upgrade my VIP level?", answer: "You can upgrade your VIP level by depositing the required amount. Higher VIP levels give you better earning bonuses and referral rates." },
]

interface ProfileScreenProps {
  onNavigateToDeposit?: () => void
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

export function ProfileScreen({ onNavigateToDeposit }: ProfileScreenProps) {
  const { user, wallet, telegramId, authHeaders, logout, refreshUser } = useUser()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [totalReferrals, setTotalReferrals] = useState(0)

  const [vipLevels, setVipLevels] = useState(DEFAULT_VIP_LEVELS)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [editName, setEditName] = useState("")

  const [vipUpgradeOpen, setVipUpgradeOpen] = useState(false)
  const [selectedVipLevel, setSelectedVipLevel] = useState<number | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgradeSuccess, setUpgradeSuccess] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(false)

  const [securityOpen, setSecurityOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)

  const [helpOpen, setHelpOpen] = useState(false)
  const [helpTab, setHelpTab] = useState<"faq" | "contact">("faq")
  const [supportSubject, setSupportSubject] = useState("")
  const [supportMessage, setSupportMessage] = useState("")
  const [supportSubmitted, setSupportSubmitted] = useState(false)

  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [darkModeEnabled, setDarkModeEnabled] = useState(true)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "User"
    : "Guest"
  const avatarInitials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
  const vipLevel = user?.vip_level ?? 0
  const availableBalance = wallet?.balance ?? 0
  const totalEarned = wallet?.total_earned ?? 0
  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : "—"

  const fetchReferralCount = useCallback(async () => {
    if (!telegramId) return
    try {
      const res = await fetch("/api/referrals", { headers: authHeaders })
      const data = await res.json()
      if (!data.error) setTotalReferrals(data.totalReferrals ?? 0)
    } catch {}
  }, [telegramId, authHeaders])

  useEffect(() => {
    setEditName(displayName)
    if (user?.photo_url) setAvatarUrl(user.photo_url)
    fetchReferralCount()
  }, [user, fetchReferralCount])

  useEffect(() => {
    fetch("/api/vip/config")
      .then(r => r.json())
      .then(d => { if (d.plans?.length) setVipLevels(d.plans) })
      .catch(() => {})
  }, [])

  const handleAvatarClick = () => fileInputRef.current?.click()
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setAvatarUrl(URL.createObjectURL(file))
  }

  const handleVipUpgrade = async () => {
    if (!selectedVipLevel || upgradeLoading) return
    const targetVip = vipLevels.find((v) => v.level === selectedVipLevel)
    if (!targetVip) return
    setUpgradeLoading(true)
    setUpgradeError(null)
    try {
      const res = await fetch("/api/vip/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ targetLevel: selectedVipLevel }),
      })
      const data = await res.json()
      if (!res.ok) { setUpgradeError(data.error ?? "Upgrade failed."); setUpgradeLoading(false); return }
      setUpgradeSuccess(true)
      await refreshUser()
      setTimeout(() => { setUpgradeSuccess(false); setVipUpgradeOpen(false); setSelectedVipLevel(null) }, 2000)
    } catch { setUpgradeError("Network error.") }
    setUpgradeLoading(false)
  }

  const handleGoToDeposit = () => {
    setVipUpgradeOpen(false); setUpgradeError(null); setSelectedVipLevel(null)
    onNavigateToDeposit?.()
  }

  const handleSubmitSupport = () => {
    if (supportSubject && supportMessage) {
      setSupportSubmitted(true)
      setTimeout(() => { setSupportSubmitted(false); setSupportSubject(""); setSupportMessage(""); setHelpOpen(false) }, 2000)
    }
  }

  const handleLogout = () => { logout(); setLogoutConfirmOpen(false) }

  const currentVip = vipLevels.find(v => v.level === vipLevel) || vipLevels[0]

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 safe-area-top animate-in fade-in duration-500">
      
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/30">
          <Settings className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Profile</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-purple-400" />Manage your account
          </p>
        </div>
      </div>

      {/* ═══════ PROFILE HEADER ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(147,51,234,0.1), rgba(219,39,119,0.05))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-4 ring-purple-500/50 shadow-xl shadow-purple-500/20">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-xl">{avatarInitials}</AvatarFallback>
              </Avatar>
              <button onClick={handleAvatarClick} className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <Camera className="h-4 w-4 text-white" />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{displayName}</h2>
                <Badge className={`bg-gradient-to-r ${currentVip.color} border-0 text-white gap-1 shadow-lg`}>
                  <Crown className="h-3 w-3" />VIP {vipLevel}
                </Badge>
              </div>
              {user?.username && <p className="text-sm text-gray-400">@{user.username}</p>}
              <p className="text-xs text-gray-500 mt-1">Member since {joinDate}</p>
            </div>
          </div>
          <Button variant="outline" className="mt-4 w-full border-purple-500/50 text-purple-400 hover:bg-purple-500/10 rounded-xl" onClick={() => setEditProfileOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />Edit Profile
          </Button>
        </div>
      </div>

      {/* ═══════ STATS ═══════ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: TrendingUp, label: "Total Earned", value: `$${totalEarned.toFixed(2)}`, gradient: "from-green-500/20 to-emerald-500/10", border: "border-green-500/30", iconColor: "text-green-400" },
          { icon: Wallet, label: "Balance", value: `$${availableBalance.toFixed(2)}`, gradient: "from-blue-500/20 to-cyan-500/10", border: "border-blue-500/30", iconColor: "text-blue-400" },
          { icon: Users, label: "Referrals", value: String(totalReferrals), gradient: "from-purple-500/20 to-pink-500/10", border: "border-purple-500/30", iconColor: "text-purple-400" },
        ].map(({ icon: Icon, label, value, gradient, border, iconColor }) => (
          <div key={label} className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-105 transition-transform`}
            style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
            <div className="p-1.5 rounded-lg bg-white/10"><Icon className={`h-4 w-4 ${iconColor}`} /></div>
            <p className="text-lg font-black text-white">{value}</p>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══════ VIP STATUS ═══════ */}
      <div className="rounded-2xl border border-yellow-500/20 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.03))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 shadow-lg shadow-yellow-500/30">
                <Crown className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-white">VIP Level {vipLevel} — {currentVip.name}</p>
                <p className="text-sm text-gray-400">{currentVip.bonus} bonus on all earnings</p>
              </div>
            </div>
            <Button size="sm" className="bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-900 font-bold rounded-xl shadow-lg shadow-yellow-500/20" onClick={() => setVipUpgradeOpen(true)}>Upgrade</Button>
          </div>
        </div>
      </div>

      {/* ═══════ SETTINGS ═══════ */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20"><Bell className="h-4 w-4 text-blue-400" /></div>
            <span className="font-medium text-white">Notifications</span>
          </div>
          <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
        </div>
        <Separator className="bg-white/5" />
        <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20"><Moon className="h-4 w-4 text-purple-400" /></div>
            <span className="font-medium text-white">Dark Mode</span>
          </div>
          <Switch checked={darkModeEnabled} onCheckedChange={setDarkModeEnabled} />
        </div>
        <Separator className="bg-white/5" />
        <button className="flex items-center justify-between p-4 w-full hover:bg-white/5 transition-colors" onClick={() => setSecurityOpen(true)}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-green-500/20"><Shield className="h-4 w-4 text-green-400" /></div>
            <span className="font-medium text-white">Security</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-500" />
        </button>
        <Separator className="bg-white/5" />
        <button className="flex items-center justify-between p-4 w-full hover:bg-white/5 transition-colors" onClick={() => setHelpOpen(true)}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20"><HelpCircle className="h-4 w-4 text-amber-400" /></div>
            <span className="font-medium text-white">Help & Support</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* ═══════ LOGOUT ═══════ */}
      <Button variant="outline" className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl" onClick={() => setLogoutConfirmOpen(true)}>
        <LogOut className="mr-2 h-4 w-4" />Log Out
      </Button>

      <div className="text-center pb-4">
        <p className="text-xs text-gray-500">GoldenTask v1.0.0</p>
        <p className="text-xs text-gray-500 mt-1">
          <button className="hover:text-purple-400 transition-colors" onClick={() => setTermsOpen(true)}>Terms</button>
          {" | "}
          <button className="hover:text-purple-400 transition-colors" onClick={() => setPrivacyOpen(true)}>Privacy</button>
        </p>
      </div>

      {/* ═══════ ALL DIALOGS (same as before, just updated glass styles) ═══════ */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="border-0 rounded-3xl" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Settings className="h-5 w-5 text-purple-400" />Edit Profile</DialogTitle>
            <DialogDescription className="text-gray-400">Update your display name</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <Avatar className="h-24 w-24 ring-4 ring-purple-500/50">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={editName} />}
                  <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-2xl">{avatarInitials}</AvatarFallback>
                </Avatar>
                <button className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center" onClick={handleAvatarClick}>
                  <Camera className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Display Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" />
            </div>
            {user?.username && (
              <div className="space-y-2">
                <Label className="text-gray-300">Telegram Username</Label>
                <Input value={`@${user.username}`} readOnly className="bg-white/5 border-white/10 text-gray-400 rounded-xl" />
              </div>
            )}
            <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" onClick={() => setEditProfileOpen(false)}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={vipUpgradeOpen} onOpenChange={(open) => { setVipUpgradeOpen(open); if (!open) { setSelectedVipLevel(null); setUpgradeError(null); setUpgradeSuccess(false) } }}>
        <DialogContent className="border-0 rounded-3xl max-h-[90vh] overflow-y-auto" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Crown className="h-5 w-5 text-yellow-400" />Upgrade VIP Level</DialogTitle>
            <DialogDescription className="text-gray-400">Unlock higher earning bonuses</DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Your Balance</span>
              <span className="font-bold text-white">${availableBalance.toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-3">
            {vipLevels.map((vip) => {
              const canAfford = availableBalance >= vip.price
              const isUpgradeable = vip.level > vipLevel
              return (
                <button key={vip.level} className={cn("w-full p-4 rounded-xl border transition-all text-left",
                  vip.level === vipLevel && "border-purple-500/50 bg-purple-500/10",
                  vip.level < vipLevel && "opacity-50",
                  vip.level > vipLevel && "border-white/10 hover:border-purple-500/30 hover:bg-white/5",
                  selectedVipLevel === vip.level && "ring-2 ring-purple-500",
                )} onClick={() => isUpgradeable && setSelectedVipLevel(vip.level)} disabled={vip.level <= vipLevel}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-r", vip.color)}>
                        <Crown className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-white">VIP {vip.level} — {vip.name}</p>
                        <p className="text-sm text-gray-400">{vip.bonus} bonus on all earnings</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {vip.level === vipLevel ? <Badge className="bg-purple-500/20 text-purple-400 border-0">Current</Badge>
                        : vip.level < vipLevel ? <Check className="h-5 w-5 text-green-400" />
                        : <div className="flex flex-col items-end"><span className="font-bold text-white">${vip.price}</span>{!canAfford && <span className="text-xs text-red-400">Insufficient</span>}</div>}
                    </div>
                  </div>
                </button>
              )
            })}
            {upgradeSuccess && (
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 flex items-center gap-2">
                <Check className="h-5 w-5" />Upgrade successful! Welcome to VIP {selectedVipLevel}!
              </div>
            )}
            {upgradeError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-3">
                <div className="flex items-start gap-2 text-red-400"><AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" /><span className="text-sm">{upgradeError}</span></div>
                <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" onClick={handleGoToDeposit}><Wallet className="mr-2 h-4 w-4" />Deposit Funds</Button>
              </div>
            )}
            {selectedVipLevel && !upgradeError && !upgradeSuccess && (
              <Button className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-900 font-bold rounded-xl" onClick={handleVipUpgrade} disabled={upgradeLoading}>
                {upgradeLoading ? "Processing..." : `Upgrade — $${vipLevels.find(v => v.level === selectedVipLevel)?.price}`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent className="border-0 rounded-3xl" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Shield className="h-5 w-5 text-green-400" />Security</DialogTitle>
            <DialogDescription className="text-gray-400">Manage your account security</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <div><p className="font-medium text-white">Two-Factor Authentication</p><p className="text-xs text-gray-400">Extra security layer</p></div>
              <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
            </div>
            <Button variant="outline" className="w-full border-white/10 text-white rounded-xl" onClick={() => { setSecurityOpen(false); setChangePasswordOpen(true) }}>Change Password</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="border-0 rounded-3xl" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white">Change Password</DialogTitle>
            <DialogDescription className="text-gray-400">Set a new secure password</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">New Password</Label>
              <div className="relative">
                <Input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl pr-10" />
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Confirm Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl" />
            </div>
            <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" disabled={newPassword.length < 6 || newPassword !== confirmPassword} onClick={() => setChangePasswordOpen(false)}>Save Password</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="border-0 rounded-3xl max-h-[80vh] overflow-y-auto" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><HelpCircle className="h-5 w-5 text-amber-400" />Help & Support</DialogTitle>
            <DialogDescription className="text-gray-400">Find answers or contact our team</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            <Button variant={helpTab === "faq" ? "default" : "outline"} size="sm" className={helpTab === "faq" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg" : "border-white/10 text-gray-400 rounded-lg"} onClick={() => setHelpTab("faq")}>FAQ</Button>
            <Button variant={helpTab === "contact" ? "default" : "outline"} size="sm" className={helpTab === "contact" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg" : "border-white/10 text-gray-400 rounded-lg"} onClick={() => setHelpTab("contact")}>Contact</Button>
          </div>
          {helpTab === "faq" ? (
            <div className="space-y-3">
              {faqItems.map((item, i) => (
                <div key={i} className="p-4 rounded-xl bg-white/5">
                  <p className="font-medium text-white mb-2">{item.question}</p>
                  <p className="text-sm text-gray-400">{item.answer}</p>
                </div>
              ))}
            </div>
          ) : supportSubmitted ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Check className="h-16 w-16 text-green-400 mb-4" />
              <p className="text-xl font-bold text-white">Message Sent!</p>
              <p className="text-sm text-gray-400 mt-2">We will get back to you within 24 hours.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Subject</Label>
                <Input value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} placeholder="What is your issue about?" className="bg-white/5 border-white/10 text-white rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Message</Label>
                <Textarea value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} placeholder="Describe your issue..." className="bg-white/5 border-white/10 text-white rounded-xl min-h-[120px]" />
              </div>
              <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl" disabled={!supportSubject || !supportMessage} onClick={handleSubmitSupport}>Send Message</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="border-0 rounded-3xl" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white">Log Out</DialogTitle>
            <DialogDescription className="text-gray-400">Are you sure you want to log out?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1 border-white/10 text-white rounded-xl" onClick={() => setLogoutConfirmOpen(false)}>Cancel</Button>
            <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl" onClick={handleLogout}>Log Out</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="border-0 rounded-3xl max-h-[80vh] overflow-y-auto" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><FileText className="h-5 w-5 text-purple-400" />Terms of Service</DialogTitle>
            <DialogDescription className="text-gray-400">Last updated: January 2024</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-400">
            <p>By using GoldenTask, you agree to these terms. You must be 18+ to use this service.</p>
            <p>Earnings are based on completing legitimate tasks. Fraud or abuse will result in account termination.</p>
            <p>Withdrawals are subject to verification and may take up to 48 hours to process.</p>
            <p>We reserve the right to modify reward rates and task requirements at any time.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="border-0 rounded-3xl max-h-[80vh] overflow-y-auto" style={{ background: "rgba(20,20,40,0.95)", backdropFilter: "blur(20px)" }}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Shield className="h-5 w-5 text-green-400" />Privacy Policy</DialogTitle>
            <DialogDescription className="text-gray-400">Last updated: January 2024</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-400">
            <p>We collect your Telegram ID, username, and profile data to provide our service.</p>
            <p>Your wallet and transaction data is stored securely and never shared with third parties.</p>
            <p>We use cookies and local storage to maintain your session.</p>
            <p>You can request deletion of your data by contacting our support team.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
