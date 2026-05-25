import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

const PRIZES  = [0.10, 0.50, 1.00, 0.25, 5.00, 0.05, 10.00, 0.15];
const WEIGHTS = [25,   20,   10,   20,   3,    30,   1,     15];
const DEFAULT_MAX_DAILY_SPINS = 3;

/* ─── UTC day key ───────────────────────────────────────────────────────── */
function getTodayKey() {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

/* ─── Weighted random ───────────────────────────────────────────────────── */
function weightedRandom(prizes: number[], weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < prizes.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return { prize: prizes[i], index: i };
  }
  return { prize: prizes[prizes.length - 1], index: prizes.length - 1 };
}

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  /* ── User ─────────────────────────────────────────────────────────────── */
  const { data: user } = await supabase
    .from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  /* ── Config ───────────────────────────────────────────────────────────── */
  const { data: adminCfg } = await supabase
    .from("admin_config").select("spin_daily_limit").eq("id", 1).maybeSingle();
  const maxDailySpins = Number(adminCfg?.spin_daily_limit ?? DEFAULT_MAX_DAILY_SPINS);
  const todayKey      = getTodayKey();

  /* ── State ────────────────────────────────────────────────────────────── */
  let { data: state } = await supabase
    .from("user_spin_state").select("*").eq("user_id", user.id).maybeSingle();

  if (!state) {
    const { data: inserted } = await supabase
      .from("user_spin_state")
      .insert({ user_id: user.id, spins_used: 0, last_reset: todayKey })
      .select().single();
    state = inserted;
  }

  /* ── BUG FIX: compare only the date portion ───────────────────────────
     last_reset is stored as TIMESTAMPTZ in some deployments, meaning the
     raw value is "2025-05-23T00:00:00+00:00". We extract "YYYY-MM-DD"
     before comparing so the daily reset works correctly regardless of the
     column type.
  ──────────────────────────────────────────────────────────────────────── */
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

  /* ── Daily limit ──────────────────────────────────────────────────────── */
  if (state.spins_used >= maxDailySpins) {
    return NextResponse.json(
      { error: "No spins left today", spinsRemaining: 0, maxSpins: maxDailySpins },
      { status: 400 }
    );
  }

  /* ── Atomic increment (anti-spam) ─────────────────────────────────────── */
  const newSpins = state.spins_used + 1;
  const { error: updateErr } = await supabase
    .from("user_spin_state")
    .update({ spins_used: newSpins })
    .eq("user_id", user.id)
    .eq("spins_used", state.spins_used); // optimistic lock: only update if unchanged

  if (updateErr) {
    return NextResponse.json({ error: "Spin conflict, try again" }, { status: 409 });
  }

  /* ── Prize ────────────────────────────────────────────────────────────── */
  const { prize, index } = weightedRandom(PRIZES, WEIGHTS);
  const now = new Date().toISOString();

  /* ── Wallet ───────────────────────────────────────────────────────────── */
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

  /* ── Log ──────────────────────────────────────────────────────────────── */
  await supabase.from("transactions").insert({
    user_id: user.id, type: "spin", amount: prize,
    status: "completed", source: "Lucky Wheel", created_at: now,
  });

  return NextResponse.json({
    success:        true,
    prize,
    prizeIndex:     index,
    spinsUsed:      newSpins,
    spinsRemaining: Math.max(0, maxDailySpins - newSpins),
    maxSpins:       maxDailySpins,
  });
}
