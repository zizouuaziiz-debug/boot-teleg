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
      { error: "Missing data" },
      { status: 400 }
    );
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!BOT_TOKEN) {
    return NextResponse.json(
      { error: "Missing bot token" },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();

  const BATCH_SIZE = 50;

  const { data: users } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("status", "active")
    .limit(3000);

  const pendingUsers = [];

  for (const user of users || []) {
    const id = String(user.telegram_id);

    const { data } = await supabase
      .from("broadcast_sent")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .eq("telegram_id", id)
      .limit(1);

    if (!data || data.length === 0) {
      pendingUsers.push(id);
    }

    if (pendingUsers.length >= BATCH_SIZE) break;
  }


  let success = 0;
  let failed = 0;


  for (const id of pendingUsers) {

    try {

      const response = await fetch(
        imageUrl
          ? `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`
          : `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            imageUrl
              ? {
                  chat_id: id,
                  photo: imageUrl,
                  caption: message || "",
                }
              : {
                  chat_id: id,
                  text: message,
                }
          ),
        }
      );


      if (response.ok) {
        await supabase.from("broadcast_sent").insert({
          broadcast_id: broadcastId,
          telegram_id: id,
        });

        success++;

      } else {
        failed++;
      }


      await new Promise(r => setTimeout(r, 100));


    } catch {
      failed++;
    }
  }


  const { count } = await supabase
    .from("broadcast_sent")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("broadcast_id", broadcastId);



  await supabase
    .from("broadcast_logs")
    .update({
      total_users: 2379,
      success_count: count || 0,
      failed_count: failed,
      status: count && count >= 2379
        ? "completed"
        : "running",
    })
    .eq("id", broadcastId);



  // إعادة تشغيل الدفعة التالية تلقائيا
  if (!count || count < 2379) {

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `https://${req.headers.get("host")}`;


    fetch(`${baseUrl}/api/admin/broadcast-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization":
          `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({
        broadcastId,
        message,
        imageUrl,
      }),
    }).catch(console.error);

  }


  return NextResponse.json({
    success: true,
    sent: success,
    total_sent: count || 0,
    failed,
  });
}
