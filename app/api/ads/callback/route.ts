import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

const REWARDS = [0.01, 0.02, 0.03, 0.05, 0.10];
const MAX_DAILY = 10;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userid");

  if (!userId) {
    return NextResponse.json({ error: "userid required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", userId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const today = new Date().toISOString().split("T")[0];

  const { count } = await supabase
    .from("ad_views")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .gte("created_at", today);

  if ((count ?? 0) >= MAX_DAILY) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 400 });
  }

  const reward = REWARDS[Math.floor(Math.random() * REWARDS.length)];

  await supabase.from("ad_views").insert({
    user_id: user.id,
    telegram_id: userId,
    reward,
  });

  const { data: wallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (wallet) {
    const newWallet = {
      balance: Number(wallet.balance) + reward,
      total_earned: Number(wallet.total_earned) + reward,
      total_withdrawn: Number(wallet.total_withdrawn),
      coins: Number(wallet.coins),
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  return NextResponse.json({ success: true, reward });
}
