"use client";

import { useState, useRef, useEffect, useCallback } from "react"
import { Crown, Settings, Bell, Shield, HelpCircle, LogOut, ChevronRight, Moon, X, Camera, Check, Eye, EyeOff, MessageCircle, FileText, AlertCircle, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  { level: 0, name: "Free",     bonus: "1%",  price: 0,    color: "bg-slate-500" },
  { level: 1, name: "Bronze",   bonus: "5%",  price: 50,   color: "bg-amber-700" },
  { level: 2, name: "Silver",   bonus: "10%", price: 150,  color: "bg-gray-400"  },
  { level: 3, name: "Gold",     bonus: "20%", price: 500,  color: "bg-yellow-500"},
  { level: 4, name: "Platinum", bonus: "35%", price: 1000, color: "bg-cyan-400"  },
  { level: 5, name: "Diamond",  bonus: "50%", price: 2000, color: "bg-purple-500"},
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

  // Load VIP config from server (admin-configurable prices)
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
      if (!res.ok) {
        setUpgradeError(data.error ?? "Upgrade failed. Please try again.")
        setUpgradeLoading(false)
        return
      }
      setUpgradeSuccess(true)
      await refreshUser()
      setTimeout(() => {
        setUpgradeSuccess(false)
        setVipUpgradeOpen(false)
        setSelectedVipLevel(null)
      }, 2000)
    } catch {
      setUpgradeError("Network error. Please try again.")
    }
    setUpgradeLoading(false)
  }

  const handleGoToDeposit = () => {
    setVipUpgradeOpen(false)
    setUpgradeError(null)
    setSelectedVipLevel(null)
    onNavigateToDeposit?.()
  }

  const handleSubmitSupport = () => {
    if (supportSubject && supportMessage) {
      setSupportSubmitted(true)
      setTimeout(() => {
        setSupportSubmitted(false)
        setSupportSubject("")
        setSupportMessage("")
        setHelpOpen(false)
      }, 2000)
    }
  }

  const handleLogout = () => {
    logout()
    setLogoutConfirmOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 p-4 safe-area-top">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      {/* Profile Header */}
      <Card className="glass-card primary-glow overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-4 ring-primary/50">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-secondary text-xl">{avatarInitials}</AvatarFallback>
              </Avatar>
              <button onClick={handleAvatarClick} className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors">
                <Camera className="h-4 w-4 text-primary-foreground" />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
                <Badge className="primary-gradient text-primary-foreground border-0 gap-1">
                  <Crown className="h-3 w-3" />
                  VIP {vipLevel}
                </Badge>
              </div>
              {user?.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
              <p className="text-xs text-muted-foreground mt-1">Member since {joinDate}</p>
            </div>
          </div>
          <Button variant="outline" className="mt-4 w-full border-primary text-primary hover:bg-primary/10" onClick={() => setEditProfileOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Edit Profile
          </Button>
        </CardContent>
      </Card>

      {/* User Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Earned</p>
            <p className="mt-1 text-lg font-bold text-gradient">${totalEarned.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="mt-1 text-lg font-bold text-foreground">${availableBalance.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Referrals</p>
            <p className="mt-1 text-lg font-bold text-foreground">{totalReferrals}</p>
          </CardContent>
        </Card>
      </div>

      {/* VIP Status Card */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full primary-gradient">
                <Crown className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">VIP Level {vipLevel}</p>
                <p className="text-sm text-muted-foreground">{vipLevels.find(v => v.level === vipLevel)?.bonus ?? "1%"} bonus on all earnings</p>
              </div>
            </div>
            <Button size="sm" className="primary-gradient" onClick={() => setVipUpgradeOpen(true)}>Upgrade</Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <Bell className="h-4 w-4 text-foreground" />
              </div>
              <span className="font-medium text-foreground">Notifications</span>
            </div>
            <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
          </div>
          <Separator className="mx-4" />
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <Moon className="h-4 w-4 text-foreground" />
              </div>
              <span className="font-medium text-foreground">Dark Mode</span>
            </div>
            <Switch checked={darkModeEnabled} onCheckedChange={setDarkModeEnabled} />
          </div>
          <Separator className="mx-4" />
          <button className="flex items-center justify-between p-4 w-full hover:bg-secondary/30 transition-colors" onClick={() => setSecurityOpen(true)}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <Shield className="h-4 w-4 text-foreground" />
              </div>
              <span className="font-medium text-foreground">Security</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <Separator className="mx-4" />
          <button className="flex items-center justify-between p-4 w-full hover:bg-secondary/30 transition-colors" onClick={() => setHelpOpen(true)}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <HelpCircle className="h-4 w-4 text-foreground" />
              </div>
              <span className="font-medium text-foreground">Help & Support</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10" onClick={() => setLogoutConfirmOpen(true)}>
        <LogOut className="mr-2 h-4 w-4" />
        Log Out
      </Button>

      <div className="text-center pb-4">
        <p className="text-xs text-muted-foreground">GoldenTask v1.0.0</p>
        <p className="text-xs text-muted-foreground mt-1">
          <button className="hover:text-primary transition-colors" onClick={() => setTermsOpen(true)}>Terms of Service</button>
          {" | "}
          <button className="hover:text-primary transition-colors" onClick={() => setPrivacyOpen(true)}>Privacy Policy</button>
        </p>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="glass-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><Settings className="h-5 w-5 text-primary" />Edit Profile</DialogTitle>
            <DialogDescription>Update your display name</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <Avatar className="h-24 w-24 ring-4 ring-primary/50">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={editName} />}
                  <AvatarFallback className="bg-secondary text-2xl">{avatarInitials}</AvatarFallback>
                </Avatar>
                <button className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center" onClick={handleAvatarClick}>
                  <Camera className="h-4 w-4 text-primary-foreground" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editName">Display Name</Label>
              <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary/50" />
            </div>
            {user?.username && (
              <div className="space-y-2">
                <Label>Telegram Username</Label>
                <Input value={`@${user.username}`} readOnly className="bg-secondary/30 text-muted-foreground" />
              </div>
            )}
            <Button className="w-full primary-gradient" onClick={() => setEditProfileOpen(false)}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* VIP Upgrade Dialog */}
      <Dialog open={vipUpgradeOpen} onOpenChange={(open) => { setVipUpgradeOpen(open); if (!open) { setSelectedVipLevel(null); setUpgradeError(null); setUpgradeSuccess(false) } }}>
        <DialogContent className="glass-card border-primary/20 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><Crown className="h-5 w-5 text-primary" />Upgrade VIP Level</DialogTitle>
            <DialogDescription>Unlock higher earning bonuses</DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Your Balance</span>
              <span className="font-bold text-foreground">${availableBalance.toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-3">
            {vipLevels.map((vip) => {
              const canAfford = availableBalance >= vip.price
              const isUpgradeable = vip.level > vipLevel
              return (
                <button key={vip.level} className={cn("w-full p-4 rounded-xl border transition-all text-left",
                  vip.level === vipLevel && "border-primary bg-primary/10",
                  vip.level < vipLevel && "opacity-50",
                  vip.level > vipLevel && "border-border hover:border-primary/50 hover:bg-secondary/30",
                  selectedVipLevel === vip.level && "ring-2 ring-primary",
                  isUpgradeable && !canAfford && "opacity-70"
                )} onClick={() => isUpgradeable && setSelectedVipLevel(vip.level)} disabled={vip.level <= vipLevel}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", vip.color)}>
                        <Crown className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">VIP {vip.level} - {vip.name}</p>
                        <p className="text-sm text-muted-foreground">{vip.bonus} bonus on all earnings</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {vip.level === vipLevel ? <Badge className="bg-primary/20 text-primary border-0">Current</Badge>
                        : vip.level < vipLevel ? <Check className="h-5 w-5 text-success" />
                        : <div className="flex flex-col items-end"><span className="font-bold text-foreground">${vip.price}</span>{!canAfford && <span className="text-xs text-destructive">Insufficient</span>}</div>}
                    </div>
                  </div>
                </button>
              )
            })}

            {upgradeSuccess && (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center gap-2 text-green-500">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Upgrade successful! Welcome to VIP {selectedVipLevel}!</span>
                </div>
              </div>
            )}

            {upgradeError && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{upgradeError}</span>
                </div>
                <Button className="w-full primary-gradient" onClick={handleGoToDeposit}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Deposit Funds
                </Button>
              </div>
            )}

            {selectedVipLevel && !upgradeError && !upgradeSuccess && (
              <Button className="w-full primary-gradient" onClick={handleVipUpgrade} disabled={upgradeLoading}>
                {upgradeLoading
                  ? "Processing..."
                  : `Upgrade to VIP ${selectedVipLevel} — $${vipLevels.find(v => v.level === selectedVipLevel)?.price}`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Security Dialog */}
      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent className="glass-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><Shield className="h-5 w-5 text-primary" />Security</DialogTitle>
            <DialogDescription>Manage your account security settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
              </div>
              <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
            </div>
            <Button variant="outline" className="w-full" onClick={() => { setSecurityOpen(false); setChangePasswordOpen(true) }}>Change PIN / Password</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="glass-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-foreground">Change Password</DialogTitle>
            <DialogDescription>Set a new secure password</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-secondary/50 pr-10" />
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-secondary/50" />
            </div>
            <Button className="w-full primary-gradient" disabled={newPassword.length < 6 || newPassword !== confirmPassword} onClick={() => setChangePasswordOpen(false)}>Save Password</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help & Support Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="glass-card border-primary/20 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><HelpCircle className="h-5 w-5 text-primary" />Help & Support</DialogTitle>
            <DialogDescription>Find answers or contact our team</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            <Button variant={helpTab === "faq" ? "default" : "outline"} size="sm" className={helpTab === "faq" ? "primary-gradient" : ""} onClick={() => setHelpTab("faq")}>FAQ</Button>
            <Button variant={helpTab === "contact" ? "default" : "outline"} size="sm" className={helpTab === "contact" ? "primary-gradient" : ""} onClick={() => setHelpTab("contact")}>Contact Us</Button>
          </div>
          {helpTab === "faq" ? (
            <div className="space-y-3">
              {faqItems.map((item, i) => (
                <div key={i} className="p-4 rounded-xl bg-secondary/30">
                  <p className="font-medium text-foreground mb-2">{item.question}</p>
                  <p className="text-sm text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>
          ) : supportSubmitted ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Check className="h-16 w-16 text-success mb-4" />
              <p className="text-xl font-bold text-foreground">Message Sent!</p>
              <p className="text-sm text-muted-foreground mt-2">We will get back to you within 24 hours.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} placeholder="What is your issue about?" className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} placeholder="Describe your issue in detail..." className="bg-secondary/50 min-h-[120px]" />
              </div>
              <Button className="w-full primary-gradient" disabled={!supportSubject || !supportMessage} onClick={handleSubmitSupport}>Send Message</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Logout Confirm Dialog */}
      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="glass-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-foreground">Log Out</DialogTitle>
            <DialogDescription>Are you sure you want to log out of your account?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setLogoutConfirmOpen(false)}>Cancel</Button>
            <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-white" onClick={handleLogout}>Log Out</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Terms Dialog */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="glass-card border-primary/20 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><FileText className="h-5 w-5 text-primary" />Terms of Service</DialogTitle>
            <DialogDescription>Last updated: January 2024</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>By using GoldenTask, you agree to these terms. You must be 18+ to use this service.</p>
            <p>Earnings are based on completing legitimate tasks. Fraud or abuse will result in account termination.</p>
            <p>Withdrawals are subject to verification and may take up to 48 hours to process.</p>
            <p>We reserve the right to modify reward rates and task requirements at any time.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Privacy Dialog */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="glass-card border-primary/20 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><Shield className="h-5 w-5 text-primary" />Privacy Policy</DialogTitle>
            <DialogDescription>Last updated: January 2024</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
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
