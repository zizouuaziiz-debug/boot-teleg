import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

const DAILY_REWARDS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50];

export async function GET(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase.from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: state } = await supabase.from("user_daily_bonus").select("*")
    .eq("user_id", user.id).maybeSingle();

  const todayStr = new Date().toISOString().split("T")[0];

  if (!state) {
    return NextResponse.json({ canClaim: true, currentDay: 1, claimed: false, rewards: DAILY_REWARDS });
  }

  const claimed = state.last_claim_date === todayStr;
  let currentDay = state.current_day as number ?? 1;

  if (state.last_claim_date) {
    const diff = Math.floor((Date.now() - new Date(state.last_claim_date).getTime()) / 86400000);
    if (diff > 1) currentDay = 1; // streak broken
  }

  return NextResponse.json({
    canClaim:   !claimed,
    currentDay: Math.min(currentDay, 7),
    claimed,
    rewards:    DAILY_REWARDS,
    lastClaim:  state.last_claim_date,
  });
}

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase.from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: state } = await supabase.from("user_daily_bonus").select("*")
    .eq("user_id", user.id).maybeSingle();

  const now      = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (state?.last_claim_date === todayStr)
    return NextResponse.json({ error: "Already claimed today" }, { status: 400 });

  let currentDay = 1;
  if (state?.last_claim_date) {
    const diff = Math.floor((now.getTime() - new Date(state.last_claim_date).getTime()) / 86400000);
    currentDay = diff === 1 ? Math.min((state.current_day as number ?? 0) + 1, 7) : 1;
  }

  const reward = DAILY_REWARDS[currentDay - 1] ?? DAILY_REWARDS[0];

  await supabase.from("user_daily_bonus").upsert({
    user_id: user.id, last_claim_date: todayStr, current_day: currentDay,
    updated_at: now.toISOString(),
  }, { onConflict: "user_id" });

  const { data: wallet } = await supabase.from("wallets")
    .select("balance, total_earned, total_withdrawn, coins").eq("user_id", user.id).maybeSingle();

  if (wallet) {
    const newWallet = {
      balance:         Number(wallet.balance)         + reward,
      total_earned:    Number(wallet.total_earned)    + reward,
      total_withdrawn: Number(wallet.total_withdrawn),
      coins:           Number(wallet.coins),
      updated_at:      now.toISOString(),
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "daily_bonus", amount: reward,
    status: "completed", source: `Daily Bonus Day ${currentDay}`,
  });

  return NextResponse.json({ success: true, reward, currentDay, nextDay: currentDay < 7 ? currentDay + 1 : 1 });
}
