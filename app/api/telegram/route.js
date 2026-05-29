import { Telegraf } from "telegraf";
import { getSupabaseAdmin } from "@/lib/supabase";

const bot = new Telegraf(process.env.BOT_TOKEN);

// ⭐️ معرف الأدمن (ضعه في .env)
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

// ── أمر /start ────────────────────────────────────────────
bot.start(async (ctx) => {
  const startParam = ctx.startPayload || "";
  
  let appUrl = "https://boot-teleg-psi.vercel.app";
  if (startParam) {
    appUrl += `?start=${startParam}`;
  }
  
  console.log("[Bot] Start command - startParam:", startParam);
  console.log("[Bot] App URL:", appUrl);

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
              web_app: {
                url: appUrl
              }
            }
          ]
        ]
      }
    }
  );
});

// ── أمر /sendmsg - إرسال لمستخدم محدد ────────────────────
bot.command("sendmsg", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply("❌ غير مصرح لك باستخدام هذا الأمر");
  }

  const args = ctx.message.text.split(" ");
  
  if (args.length < 3) {
    return ctx.reply(
      "⚠️ *طريقة الاستخدام:*\n\n" +
      "`/sendmsg [telegram_id] [الرسالة]`\n\n" +
      "📌 *مثال:*\n" +
      "`/sendmsg 123456789 مرحبا بك`",
      { parse_mode: "Markdown" }
    );
  }

  const targetId = args[1];
  const message = args.slice(2).join(" ");

  try {
    await bot.telegram.sendMessage(targetId, message);
    ctx.reply(`✅ تم إرسال الرسالة بنجاح إلى \`${targetId}\``, { parse_mode: "Markdown" });
  } catch (err) {
    ctx.reply(`❌ فشل في الإرسال: ${err.message}`);
  }
});

// ── أمر /broadcast - إرسال للجميع ─────────────────────────
bot.command("broadcast", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply("❌ غير مصرح لك باستخدام هذا الأمر");
  }

  const message = ctx.message.text.replace("/broadcast", "").trim();
  
  if (!message) {
    return ctx.reply(
      "⚠️ *طريقة الاستخدام:*\n\n" +
      "`/broadcast [الرسالة]`\n\n" +
      "📌 *مثال:*\n" +
      "`/broadcast تحديث جديد في التطبيق!`",
      { parse_mode: "Markdown" }
    );
  }

  const waitMsg = await ctx.reply("⏳ جاري الإرسال...");

  const supabase = getSupabaseAdmin();
  const { data: users, error } = await supabase
    .from("users")
    .select("telegram_id");

  if (error || !users || users.length === 0) {
    return ctx.telegram.editMessageText(
      waitMsg.chat.id,
      waitMsg.message_id,
      undefined,
      "❌ لا يوجد مستخدمين في قاعدة البيانات"
    );
  }

  let success = 0;
  let failed = 0;
  const total = users.length;

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.telegram_id, message);
      success++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  await ctx.telegram.editMessageText(
    waitMsg.chat.id,
    waitMsg.message_id,
    undefined,
    `📊 *نتائج الإرسال:*\n\n` +
    `👥 إجمالي المستخدمين: ${total}\n` +
    `✅ تم الإرسال: ${success}\n` +
    `❌ فشل: ${failed}`,
    { parse_mode: "Markdown" }
  );
});

// ── أمر /adminhelp ─────────────────────────────────────────
bot.command("adminhelp", async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return;

  ctx.reply(
    "🤖 *أوامر الأدمن:*\n\n" +
    "📨 `/sendmsg [id] [رسالة]` - إرسال لمستخدم\n" +
    "📢 `/broadcast [رسالة]` - إرسال للجميع\n\n" +
    "📌 *أمثلة:*\n" +
    "`/sendmsg 123456789 مرحبا`\n" +
    "`/broadcast تحديث جديد`",
    { parse_mode: "Markdown" }
  );
});

// ── Webhook handler ───────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[Bot] Error:", err);
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
