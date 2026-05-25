import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("admin_config").select("spin_daily_limit").eq("id", 1).maybeSingle();
  return NextResponse.json({ spinDailyLimit: data?.spin_daily_limit ?? 3 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { spinDailyLimit } = body as { spinDailyLimit?: number };
  if (spinDailyLimit === undefined) return NextResponse.json({ error: "spinDailyLimit required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("admin_config").upsert({ id: 1, spin_daily_limit: Number(spinDailyLimit), updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
