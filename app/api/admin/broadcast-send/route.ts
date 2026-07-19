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

  // عدد صغير حتى لا يتجاوز Vercel timeout
  const BATCH_SIZE = 10;

  const { data: allUsers, error } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("status", "active");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }


  const usersToSend: string[] = [];


  for (const user of allUsers || []) {

    const telegramId = String(user.telegram_id);

    const { data: alreadySent } = await supabase
      .from("broadcast_sent")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .eq("telegram_id", telegramId)
      .limit(1);


    if (!alreadySent || alreadySent.length === 0) {
      usersToSend.push(telegramId);
    }


    if (usersToSend.length >= BATCH_SIZE) {
      break;
    }
  }


  let success = 0;
  let failed = 0;


  for (const telegramId of usersToSend) {

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


      // حماية من Telegram rate limit
      await new Promise(resolve =>
        setTimeout(resolve, 150)
      );


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



  const totalUsers = allUsers?.length || 0;


  await supabase
    .from("broadcast_logs")
    .update({
      total_users: totalUsers,
      success_count: count || 0,
      failed_count: failed,
      status:
        (count || 0) >= totalUsers
          ? "completed"
          : "running",
    })
    .eq("id", broadcastId);



  // تشغيل الدفعة التالية
  if ((count || 0) < totalUsers) {

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
    total_sent: count || 0,
    total_users: totalUsers,
  });
}
