import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { message } = body;

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  // تحقق من broadcast قيد التنفيذ
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: running } = await supabase
    .from("broadcast_logs")
    .select("id")
    .eq("status", "running")
    .gte("created_at", fiveMinAgo)
    .limit(1);

  if (running && running.length > 0) {
    return NextResponse.json({ error: "Broadcast already in progress" }, { status: 409 });
  }

  // سجل broadcast جديد
  const { data: log } = await supabase
    .from("broadcast_logs")
    .insert({ message, status: "running" })
    .select()
    .single();

  if (!log) {
    return NextResponse.json({ error: "Failed to start broadcast" }, { status: 500 });
  }

  // ابدأ الإرسال في الخلفية
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  
  fetch(`${baseUrl}/api/admin/broadcast-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ broadcastId: log.id, message }),
  }).catch(console.error);

  return NextResponse.json({ success: true, message: "Broadcast started" });
}
