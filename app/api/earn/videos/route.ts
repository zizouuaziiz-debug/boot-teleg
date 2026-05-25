import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

export async function GET(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase.from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: videos } = await supabase.from("videos").select("*")
    .eq("is_active", true).order("created_at", { ascending: false });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: watchHistory } = await supabase.from("video_watches")
    .select("video_id").eq("user_id", user.id).gte("watched_at", today.toISOString());

  const watchedToday = new Set((watchHistory ?? []).map((w: { video_id: string }) => w.video_id));

  return NextResponse.json({
    videos: (videos ?? []).map((v) => ({ ...v, watchedToday: watchedToday.has(v.id as string) })),
  });
}

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { video_id } = body as { video_id?: string };
  if (!video_id) return NextResponse.json({ error: "video_id required" }, { status: 400 });

  const { data: user } = await supabase.from("users").select("id, vip_level")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: video } = await supabase.from("videos").select("*")
    .eq("id", video_id).eq("is_active", true).maybeSingle();
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: existing } = await supabase.from("video_watches").select("id")
    .eq("user_id", user.id).eq("video_id", video_id)
    .gte("watched_at", today.toISOString()).maybeSingle();
  if (existing) return NextResponse.json({ error: "Already watched today" }, { status: 400 });

  const { data: adminCfg } = await supabase.from("admin_config")
    .select("reward_per_video, vip_multiplier, daily_video_limit")
    .eq("id", 1).maybeSingle();

  const baseReward    = Number(video.reward ?? adminCfg?.reward_per_video ?? 0.05);
  const vipMultiplier = user.vip_level > 0 ? Number(adminCfg?.vip_multiplier ?? 1.5) : 1;
  const reward        = Math.round(baseReward * vipMultiplier * 1e8) / 1e8;

  const dailyLimit = Number(adminCfg?.daily_video_limit ?? 50);
  const { count: watchedCount } = await supabase.from("video_watches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("watched_at", today.toISOString());
  if ((watchedCount ?? 0) >= dailyLimit)
    return NextResponse.json({ error: "Daily video limit reached" }, { status: 400 });

  await supabase.from("video_watches").insert({ user_id: user.id, video_id, watched_at: new Date().toISOString(), reward });

  const { data: wallet } = await supabase.from("wallets")
    .select("balance, total_earned, total_withdrawn, coins")
    .eq("user_id", user.id).maybeSingle();

  if (wallet) {
    const newWallet = {
      balance:         Number(wallet.balance)         + reward,
      total_earned:    Number(wallet.total_earned)    + reward,
      total_withdrawn: Number(wallet.total_withdrawn),
      coins:           Number(wallet.coins),
      updated_at:      new Date().toISOString(),
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "earning", amount: reward, status: "completed", source: `video:${video_id}`,
  });

  return NextResponse.json({ success: true, reward });
}
