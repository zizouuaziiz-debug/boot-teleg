import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Returns public settings visible to users (min withdrawal, limits, etc.) */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("admin_config")
    .select("min_withdrawal, daily_video_limit, reward_per_video, cooldown_seconds, spin_daily_limit")
    .eq("id", 1)
    .maybeSingle();

  const res = NextResponse.json({
    minWithdrawal:   Number(data?.min_withdrawal  ?? 10),
    dailyVideoLimit: Number(data?.daily_video_limit ?? 50),
    rewardPerVideo:  Number(data?.reward_per_video  ?? 0.05),
    cooldownSeconds: Number(data?.cooldown_seconds  ?? 30),
    spinDailyLimit:  Number(data?.spin_daily_limit  ?? 3),
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
