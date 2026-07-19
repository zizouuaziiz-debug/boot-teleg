import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { broadcastId, message, imageUrl } = body;

  if (!broadcastId || (!message && !imageUrl)) {
    return NextResponse.json(
      { error: "Missing broadcast data" },
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

  // عدد صغير حتى لا يحدث Vercel timeout
  const BATCH_SIZE = 10;


  // جلب المستخدمين مع تجاوز حد Supabase 1000
  const { data: allUsers, error } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("status", "active")
    .range(0, 5000);


  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }


  // العدد الحقيقي للمستخدمين
  const { count: totalUsers } = await supabase
    .from("users")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("status", "active");



  const pendingUsers: string[] = [];


  for (const user of allUsers || []) {

    const telegramId = String(user.telegram_id);


    const { data: sent } = await supabase
      .from("broadcast_sent")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .eq("telegram_id", telegramId)
      .limit(1);


    if (!sent || sent.length === 0) {
      pendingUsers.push(telegramId);
    }


    if (pendingUsers.length >= BATCH_SIZE) {
      break;
    }
  }



  let success = 0;
  let failed = 0;



  for (const telegramId of pendingUsers) {

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
                  chat_id: telegramId,
                  photo: imageUrl,
                  caption: message || "",
                }
              : {
                  chat_id: telegramId,
                  text: message,
                }
          ),
        }
      );


      if (response.ok) {

        await supabase
          .from("broadcast_sent")
          .insert({
            broadcast_id: broadcastId,
            telegram_id: telegramId,
          });

        success++;

      } else {

        failed++;

      }


      await new Promise(resolve =>
        setTimeout(resolve, 150)
      );


    } catch {

      failed++;

    }
  }



  const { count: sentCount } = await supabase
    .from("broadcast_sent")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("broadcast_id", broadcastId);



  await supabase
    .from("broadcast_logs")
    .update({
      total_users: totalUsers || 0,
      success_count: sentCount || 0,
      failed_count: failed,
      status:
        (sentCount || 0) >= (totalUsers || 0)
          ? "completed"
          : "running",
    })
    .eq("id", broadcastId);



  // تشغيل الدفعة التالية تلقائيا
  if ((sentCount || 0) < (totalUsers || 0)) {

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `https://${req.headers.get("host")}`;


    fetch(
      `${baseUrl}/api/admin/broadcast-send`,
      {
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
      }
    ).catch(() => {});
  }



  return NextResponse.json({
    success: true,
    sent_this_batch: success,
    failed,
    total_sent: sentCount || 0,
    total_users: totalUsers || 0,
  });
}
