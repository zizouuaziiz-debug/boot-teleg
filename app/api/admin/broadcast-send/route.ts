import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { broadcastId, message, imageUrl } = body;

  if (!broadcastId || (!message && !imageUrl)) {
    return NextResponse.json({ error: "broadcastId and message or imageUrl required" }, { status: 400 });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "Bot token missing" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("status", "active");

  let success = 0;
  let failed = 0;

  for (const user of users || []) {
    const id = String(user.telegram_id);
    if (!id) continue;

    const { data: sent } = await supabase
      .from("broadcast_sent")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .eq("telegram_id", id)
      .limit(1);

    if (sent && sent.length > 0) continue;

    try {
      let res;

      if (imageUrl) {
        // إرسال صورة مع تعليق
        res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: id,
            photo: imageUrl,
            caption: message || "",
          }),
        });
      } else {
        // إرسال نص فقط
        res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: id,
            text: message,
          }),
        });
      }

      if (res.ok) {
        await supabase.from("broadcast_sent").insert({
          broadcast_id: broadcastId,
          telegram_id: id,
        });
        success++;
      } else {
        failed++;
      }

      await new Promise(r => setTimeout(r, 50));
    } catch {
      failed++;
    }
  }

  await supabase
    .from("broadcast_logs")
    .update({
      total_users: users?.length || 0,
      success_count: success,
      failed_count: failed,
      status: "completed",
    })
    .eq("id", broadcastId);

  return NextResponse.json({ success: true, sent: success, failed });
}
