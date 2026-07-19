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
    return NextResponse.json(
      { error: "broadcastId and message or imageUrl required" },
      { status: 400 }
    );
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!BOT_TOKEN) {
    return NextResponse.json(
      { error: "Bot token missing" },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();

  // إرسال 200 مستخدم فقط في كل تشغيل
  const BATCH_SIZE = 200;

  const { data: allUsers, error } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("status", "active")
    .limit(3000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = [];

  for (const user of allUsers || []) {
    const id = String(user.telegram_id);

    const { data: sent } = await supabase
      .from("broadcast_sent")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .eq("telegram_id", id)
      .limit(1);

    if (!sent || sent.length === 0) {
      users.push(user);
    }

    if (users.length >= BATCH_SIZE) break;
  }

  let success = 0;
  let failed = 0;

  for (const user of users) {
    const id = String(user.telegram_id);

    try {
      let res;

      if (imageUrl) {
        res = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: id,
              photo: imageUrl,
              caption: message || "",
            }),
          }
        );
      } else {
        res = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: id,
              text: message,
            }),
          }
        );
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

      await new Promise((r) => setTimeout(r, 50));

    } catch {
      failed++;
    }
  }

  const { count } = await supabase
    .from("broadcast_sent")
    .select("*", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId);


  await supabase
    .from("broadcast_logs")
    .update({
      total_users: 2379,
      success_count: count || 0,
      failed_count: failed,
      status: "running",
    })
    .eq("id", broadcastId);


  return NextResponse.json({
    success: true,
    sent_this_batch: success,
    failed,
    total_sent: count || 0,
    remaining: 2379 - (count || 0),
  });
}
