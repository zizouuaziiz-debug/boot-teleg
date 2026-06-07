import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import { creditReferralReward } from "@/lib/creditReferralReward";

const PRIZES  = [0.10, 0.50, 1.00, 0.25, 0.20, 0.05, 2.00, 0.15];
const WEIGHTS = [25,   20,   10,   20,   3,    30,   1,     15];
const DEFAULT_MAX_DAILY_SPINS = 3;

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function weightedRandom(prizes: number[], weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < prizes.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return { prize: prizes[i], index: i };
  }
  return { prize: prizes[prizes.length - 1], index: prizes.length - 1 };
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

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: adminCfg } = await supabase
    .from("admin_config").select("spin_daily_limit").eq("id", 1).maybeSingle();
  const maxDailySpins = Number(adminCfg?.spin_daily_limit ?? DEFAULT_MAX_DAILY_SPINS);
  const todayKey      = getTodayKey();

  let { data: state } = await supabase
    .from("user_spin_state").select("*").eq("user_id", user.id).maybeSingle();

  if (!state) {
    const { data: inserted } = await supabase
      .from("user_spin_state")
      .insert({ user_id: user.id, spins_used: 0, last_reset: todayKey })
      .select().single();
    state = inserted;
  }

  const storedDate = state.last_reset
    ? String(state.last_reset).split("T")[0]
    : null;

  if (storedDate !== todayKey) {
    await supabase
      .from("user_spin_state")
      .update({ spins_used: 0, last_reset: todayKey })
      .eq("user_id", user.id);
    state.spins_used = 0;
    state.last_reset = todayKey;
  }

  if (state.spins_used >= maxDailySpins) {
    return NextResponse.json(
      { error: "No spins left today", spinsRemaining: 0, maxSpins: maxDailySpins },
      { status: 400 }
    );
  }

  const newSpins = state.spins_used + 1;
  const { error: updateErr } = await supabase
    .from("user_spin_state")
    .update({ spins_used: newSpins })
    .eq("user_id", user.id)
    .eq("spins_used", state.spins_used);

  if (updateErr) {
    return NextResponse.json({ error: "Spin conflict, try again" }, { status: 409 });
  }

  const { prize, index } = weightedRandom(PRIZES, WEIGHTS);
  const now = new Date().toISOString();

  const { data: wallet } = await supabase
    .from("wallets").select("*").eq("user_id", user.id).maybeSingle();

  if (wallet) {
    const newWallet = {
      balance:         Number(wallet.balance        || 0) + prize,
      total_earned:    Number(wallet.total_earned   || 0) + prize,
      total_withdrawn: Number(wallet.total_withdrawn|| 0),
      coins:           Number(wallet.coins          || 0),
      updated_at:      now,
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "spin", amount: prize,
    status: "completed", source: "Lucky Wheel", created_at: now,
  });

  await creditReferralReward(user.id, prize);

  return NextResponse.json({
    success:        true,
    prize,
    prizeIndex:     index,
    spinsUsed:      newSpins,
    spinsRemaining: Math.max(0, maxDailySpins - newSpins),
    maxSpins:       maxDailySpins,
  });
}
