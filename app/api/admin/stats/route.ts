import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  const { data: todayTx } = await supabase
    .from("transactions")
    .select("amount")
    .gte("created_at", today)
    .in("type", ["spin", "mining", "daily_bonus", "mystery_box", "referral"]);

  const todayEarnings = (todayTx ?? []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

  const { count: todaySpins } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("type", "spin")
    .gte("created_at", today);

  const { count: activeMining } = await supabase
    .from("mining_sessions")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { data: deposits } = await supabase
    .from("transactions")
    .select("amount")
    .eq("type", "deposit")
    .eq("status", "approved");

  const totalDeposits = (deposits ?? []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);

  return NextResponse.json({
    todayEarnings,
    todaySpins: todaySpins ?? 0,
    activeMining: activeMining ?? 0,
    totalDeposits,
  });
}
