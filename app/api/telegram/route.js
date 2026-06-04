import { Telegraf } from "telegraf";
import { getSupabaseAdmin } from "@/lib/supabase";

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

// 🔒 قفل لمنع تشغيل broadcast مرتين
let isBroadcastRunning = false;

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

  // 🔒 منع تشغيل مرتين
  if (isBroadcastRunning) {
    return ctx.reply("⏳ يوجد إرسال قيد التنفيذ، انتظر...");
  }

  isBroadcastRunning = true;

  const waitMsg = await ctx.reply("⏳ جاري الإرسال...");

  try {
    const supabase = getSupabaseAdmin();
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id");

    let success = 0;
    let failed = 0;

    // ⭐ يمنع التكرار داخل نفس العملية
    const sent = new Set();

    for (const user of users || []) {
      const id = user.telegram_id;

      if (!id || sent.has(id)) continue;
      sent.add(id);

      try {
        await bot.telegram.sendMessage(id, message);
        success++;
      } catch {
        failed++;
      }
    }

    await ctx.telegram.editMessageText(
      waitMsg.chat.id,
      waitMsg.message_id,
      undefined,
      `📊 تم الإرسال\n\n👥 ${users.length}\n✅ ${success}\n❌ ${failed}`
    );

  } catch (err) {
    console.error(err);
    await ctx.reply("❌ حدث خطأ أثناء الإرسال");
  } finally {
    isBroadcastRunning = false;
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
