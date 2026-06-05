import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";
import { creditReferralReward } from "@/lib/creditReferralReward";

const MYSTERY_REWARDS = [0.10, 0.25, 0.50, 1.00, 2.00];

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // جلب الإعدادات من admin_config
  const { data: cfg } = await supabase
    .from("admin_config")
    .select("mystery_cooldown, mystery_max_reward")
    .eq("id", 1)
    .maybeSingle();

  const cooldownHours = cfg?.mystery_cooldown ?? 4;
  const maxReward = cfg?.mystery_max_reward ?? 2;

  // جلب آخر صندوق
  const { data: box } = await supabase
    .from("mystery_boxes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const canOpen = !box || (new Date(box.opened_at || box.created_at).getTime() + cooldownHours * 3600000) < now.getTime();
  
  let timeLeft = "";
  if (!canOpen && box) {
    const next = new Date((new Date(box.opened_at || box.created_at)).getTime() + cooldownHours * 3600000);
    const diff = next.getTime() - now.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    timeLeft = `${h}h ${m}m`;
  }

  return NextResponse.json({ canOpen, timeLeft, maxReward });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // جلب الإعدادات من admin_config
  const { data: cfg } = await supabase
    .from("admin_config")
    .select("mystery_cooldown, mystery_max_reward")
    .eq("id", 1)
    .maybeSingle();

  const cooldownHours = cfg?.mystery_cooldown ?? 4;
  const maxReward = cfg?.mystery_max_reward ?? 2;

  // فلترة الجوائز حسب maxReward
  const availableRewards = MYSTERY_REWARDS.filter(r => r <= maxReward);
  if (availableRewards.length === 0) {
    return NextResponse.json({ error: "No rewards available" }, { status: 500 });
  }

  const { data: lastBox } = await supabase
    .from("mystery_boxes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  if (lastBox) {
    const nextAvailable = new Date((lastBox.opened_at || lastBox.created_at)).getTime() + cooldownHours * 3600000;
    if (now.getTime() < nextAvailable) {
      return NextResponse.json({ error: "Mystery box not available yet" }, { status: 400 });
    }
  }

  const reward = availableRewards[Math.floor(Math.random() * availableRewards.length)];

  await supabase.from("mystery_boxes").insert({
    user_id: user.id,
    reward,
    opened_at: now.toISOString(),
  });

  const { data: wallet } = await supabase
    .from("wallets").select("*").eq("user_id", user.id).maybeSingle();

  if (wallet) {
    const newWallet = {
      balance: Number(wallet.balance) + reward,
      total_earned: Number(wallet.total_earned) + reward,
      total_withdrawn: Number(wallet.total_withdrawn),
      coins: Number(wallet.coins),
      updated_at: now.toISOString(),
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "mystery_box", amount: reward,
    status: "completed", source: "Mystery Box",
  });

  await creditReferralReward(user.id, reward);

  return NextResponse.json({ success: true, reward });
}