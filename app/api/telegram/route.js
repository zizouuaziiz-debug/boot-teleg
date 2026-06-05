import { Telegraf } from "telegraf";
import { getSupabaseAdmin } from "@/lib/supabase";

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

// ── /start ─────────────────────────────
bot.start(async (ctx) => {
  const startParam = ctx.startPayload || "";

  let appUrl = "https://boot-teleg-psi.vercel.app";
  if (startParam) appUrl += `?start=${startParam}`;

  await ctx.replyWithPhoto(
    "https://boot-teleg-psi.vercel.app/myimage.png",
    {
      caption: `💰 Spin & Win UP TO $10!

🥳 Don't miss out on this fun and rewarding opportunity!

👇👇👇 CLICK TO EARN 👇👇👇`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💰 Play Now",
              web_app: { url: appUrl }
            }
          ]
        ]
      }
    }
  );
});

// ── /broadcast ─────────────────────────
bot.command("broadcast", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply("❌ غير مصرح لك");
  }

  const message = ctx.message.text.replace("/broadcast", "").trim();

  if (!message) {
    return ctx.reply("⚠️ اكتب رسالة بعد الأمر");
  }

  const supabase = getSupabaseAdmin();

  // ⭐️ تحقق إذا فيه broadcast قيد التنفيذ (خلال آخر 5 دقائق)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: running } = await supabase
    .from("broadcast_logs")
    .select("id")
    .eq("status", "running")
    .gte("created_at", fiveMinAgo)
    .limit(1);

  if (running && running.length > 0) {
    return ctx.reply("⏳ يوجد إرسال قيد التنفيذ، انتظر...");
  }

  // ⭐️ سجل broadcast جديد
  const { data: log } = await supabase
    .from("broadcast_logs")
    .insert({ message, status: "running" })
    .select()
    .single();

  if (!log) {
    return ctx.reply("❌ فشل في بدء الإرسال");
  }

  const waitMsg = await ctx.reply("⏳ جاري الإرسال...");

  try {
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id")
      .eq("status", "active");

    let success = 0;
    let failed = 0;
    const shuffled = [...(users || [])].sort(() => Math.random() - 0.5);

    for (const user of shuffled) {
      const id = String(user.telegram_id);
      if (!id) continue;

      // ⭐️ تحقق إذا الرسالة انرسلت له بالفعل
      const { data: alreadySent } = await supabase
        .from("broadcast_sent")
        .select("id")
        .eq("broadcast_id", log.id)
        .eq("telegram_id", id)
        .limit(1);

      if (alreadySent && alreadySent.length > 0) continue;

      try {
        await bot.telegram.sendMessage(id, message);
        
        // ⭐️ سجل إنها انرسلت
        await supabase.from("broadcast_sent").insert({
          broadcast_id: log.id,
          telegram_id: id,
        });
        
        success++;
        await new Promise(r => setTimeout(r, 50));
      } catch {
        failed++;
      }
    }

    // ⭐️ حدث الـ log
    await supabase
      .from("broadcast_logs")
      .update({
        total_users: users?.length || 0,
        success_count: success,
        failed_count: failed,
        status: "completed",
      })
      .eq("id", log.id);

    await ctx.telegram.editMessageText(
      waitMsg.chat.id,
      waitMsg.message_id,
      undefined,
      `📊 تم الإرسال\n\n👥 ${users?.length || 0}\n✅ ${success}\n❌ ${failed}`
    );

  } catch (err) {
    console.error(err);
    await supabase
      .from("broadcast_logs")
      .update({ status: "failed" })
      .eq("id", log.id);
    await ctx.reply("❌ حدث خطأ أثناء الإرسال");
  }
});

// ── webhook ───────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
