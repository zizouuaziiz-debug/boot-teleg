import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const DEFAULT_MAX_DAILY_SPINS = 3;

function getTodayKey() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: adminCfg } = await supabase
    .from("admin_config").select("spin_daily_limit").eq("id", 1).maybeSingle();
  const maxDailySpins = Number(adminCfg?.spin_daily_limit ?? DEFAULT_MAX_DAILY_SPINS);

  const todayKey = getTodayKey();

  const { data: state } = await supabase
    .from("user_spin_state").select("*").eq("user_id", user.id).maybeSingle();

  let spinsUsed = 0;
  if (state) {
    // Compare only date portion — handles both DATE and TIMESTAMPTZ columns
    const storedDate = state.last_reset
      ? String(state.last_reset).split("T")[0]
      : null;
    spinsUsed = storedDate === todayKey ? Number(state.spins_used ?? 0) : 0;
  }

  return NextResponse.json({
    spinsUsed,
    spinsRemaining: Math.max(0, maxDailySpins - spinsUsed),
    maxSpins: maxDailySpins,
    canSpin: spinsUsed < maxDailySpins,
  });
}
