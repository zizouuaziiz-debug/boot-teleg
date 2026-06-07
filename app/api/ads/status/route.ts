import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  const { count } = await supabase
    .from("ad_views")
    .select("*", { count: "exact" })
    .eq("telegram_id", telegramId)
    .gte("created_at", today);

  return NextResponse.json({ watched: count ?? 0, maxDaily: 10 });
}
