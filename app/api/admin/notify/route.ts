import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token || !verifySessionToken(token)) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const { message, imageUrl } = body;

  if (!message && !imageUrl) {
    return NextResponse.json(
      { error: "Message or image required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const fiveMinAgo = new Date(
    Date.now() - 5 * 60 * 1000
  ).toISOString();

  const { data: running } = await supabase
    .from("broadcast_logs")
    .select("id")
    .eq("status", "running")
    .gte("created_at", fiveMinAgo)
    .limit(1);

  let broadcastId: string;

  if (running && running.length > 0) {
    // إذا كان هناك بث جارٍ، أكمله
    broadcastId = running[0].id;
  } else {
    // أنشئ بثًا جديدًا
    const { data: log, error } = await supabase
      .from("broadcast_logs")
      .insert({
        message: message || imageUrl,
        status: "running",
        total_users: 0,
        success_count: 0,
        failed_count: 0,
      })
      .select()
      .single();

    if (error || !log) {
      return NextResponse.json(
        { error: "Failed to start broadcast" },
        { status: 500 }
      );
    }

    broadcastId = log.id;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `https://${req.headers.get("host")}`;

  // لا ننتظر انتهاء الإرسال
  fetch(`${baseUrl}/api/admin/broadcast-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      broadcastId,
      message,
      imageUrl,
    }),
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    broadcastId,
    message: "Broadcast started",
  });
}
