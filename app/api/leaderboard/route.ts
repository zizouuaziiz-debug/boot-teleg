import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  
  const today = new Date().toISOString().split("T")[0];
  
  // Top earners اليوم
  const { data: topEarners } = await supabase
    .from("wallets")
    .select("user_id, total_earned, users!inner(first_name, username, telegram_id)")
    .order("total_earned", { ascending: false })
    .limit(10);

  // ترتيب المستخدم الحالي
  const telegramId = req.headers.get("x-telegram-id");
  let userRank = null;
  
  if (telegramId) {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();
      
    if (user) {
      const { data: allWallets } = await supabase
        .from("wallets")
        .select("user_id, total_earned")
        .order("total_earned", { ascending: false });
        
      const rank = (allWallets ?? []).findIndex(w => w.user_id === user.id) + 1;
      const userWallet = (allWallets ?? []).find(w => w.user_id === user.id);
      userRank = { rank, earned: userWallet?.total_earned ?? 0 };
    }
  }

  const leaders = (topEarners ?? []).map((w: any, i: number) => ({
    rank: i + 1,
    name: w.users?.first_name || w.users?.username || `User ${i + 1}`,
    earned: w.total_earned ?? 0,
    isCurrentUser: w.user_id === userRank?.rank ? true : false,
  }));

  return NextResponse.json({ leaders, userRank });
}
