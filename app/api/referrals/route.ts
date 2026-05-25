import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id, referral_code, referred_by")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: referrals } = await supabase
    .from("referrals")
    .select("*, referred:referred_id(id, first_name, last_name, username, created_at)")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  const totalEarnings = (referrals ?? []).reduce(
    (sum: number, r: { earnings: number }) => sum + Number(r.earnings ?? 0), 0
  );
  const activeCount = (referrals ?? []).length;

  const tier = activeCount <= 10 ? 1 : activeCount <= 50 ? 2 : activeCount <= 100 ? 3 : 4;
  const tierNames   = ["", "Bronze", "Silver", "Gold", "Diamond"];
  const commissions = ["", "10%", "15%", "20%", "25%"];
  const nextTierAt  = [0, 10, 50, 100, Infinity];

  return NextResponse.json({
    referralCode:      user.referral_code,
    referrals:         referrals ?? [],
    totalReferrals:    activeCount,
    activeReferrals:   activeCount,
    totalEarnings,
    pendingEarnings:   0,
    tier,
    tierName:          tierNames[tier],
    commission:        commissions[tier],
    nextTierProgress:  nextTierAt[tier] > 0
      ? Math.min(100, Math.round((activeCount / nextTierAt[tier]) * 100))
      : 100,
    nextTierAt:        nextTierAt[tier],
  });
}
