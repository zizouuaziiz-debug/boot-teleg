import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("admin_config").select("*")
    .eq("id", 1).maybeSingle();

  const depositAddresses  = (data?.deposit_addresses  as Record<string, string>) ?? {};
  const nowpaymentsConfig = (data?.nowpayments_config as Record<string, string>) ?? {};

  return NextResponse.json({
    settings: {
      minWithdrawal:      data?.min_withdrawal      ?? 10,
      dailyVideoLimit:    data?.daily_video_limit   ?? 50,
      referralCommission: data?.referral_commission ?? 10,
      rewardPerVideo:     data?.reward_per_video    ?? 0.05,
      maxDailyEarnings:   data?.max_daily_earnings  ?? 25,
      cooldownSeconds:    data?.cooldown_seconds    ?? 30,
      minWatchPercent:    data?.min_watch_percent   ?? 80,
      vipMultiplier:      data?.vip_multiplier      ?? 1.5,
      spinDailyLimit:     data?.spin_daily_limit    ?? 3,
      // Watch & Earn Ads config
      maxDailyAds:        data?.max_daily_ads       ?? 5,
      rewardPerAd:        data?.reward_per_ad       ?? 0.05,
      adCooldownSeconds:  data?.ad_cooldown_seconds ?? 30,
    },
    depositAddresses: {
      tron: depositAddresses.tron ?? "",
      eth:  depositAddresses.eth  ?? "",
      bsc:  depositAddresses.bsc  ?? "",
    },
    nowpayments: {
      apiKey:    nowpaymentsConfig.apiKey    ?? "",
      ipnSecret: nowpaymentsConfig.ipnSecret ?? "",
    },
  });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const body     = await req.json().catch(() => ({}));
  const supabase = getSupabaseAdmin();
  const settings = body.settings ?? body;

  const payload: Record<string, unknown> = {
    id:         1,
    updated_at: new Date().toISOString(),
  };

  if (settings.minWithdrawal      !== undefined) payload.min_withdrawal       = settings.minWithdrawal;
  if (settings.dailyVideoLimit    !== undefined) payload.daily_video_limit    = settings.dailyVideoLimit;
  if (settings.referralCommission !== undefined) payload.referral_commission  = settings.referralCommission;
  if (settings.rewardPerVideo     !== undefined) payload.reward_per_video     = settings.rewardPerVideo;
  if (settings.maxDailyEarnings   !== undefined) payload.max_daily_earnings   = settings.maxDailyEarnings;
  if (settings.cooldownSeconds    !== undefined) payload.cooldown_seconds     = settings.cooldownSeconds;
  if (settings.minWatchPercent    !== undefined) payload.min_watch_percent    = settings.minWatchPercent;
  if (settings.vipMultiplier      !== undefined) payload.vip_multiplier       = settings.vipMultiplier;
  if (settings.spinDailyLimit     !== undefined) payload.spin_daily_limit     = settings.spinDailyLimit;
  // Watch & Earn Ads
  if (settings.maxDailyAds        !== undefined) payload.max_daily_ads        = settings.maxDailyAds;
  if (settings.rewardPerAd        !== undefined) payload.reward_per_ad        = settings.rewardPerAd;
  if (settings.adCooldownSeconds  !== undefined) payload.ad_cooldown_seconds  = settings.adCooldownSeconds;

  if (body.depositAddresses) payload.deposit_addresses  = body.depositAddresses;
  if (body.nowpayments)      payload.nowpayments_config = body.nowpayments;
  if (body.mining)           payload.mining_config      = body.mining;
  if (body.vip)              payload.vip_config         = body.vip;
  if (body.ads)              payload.ad_networks        = body.ads;

  const { error } = await supabase.from("admin_config").upsert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
