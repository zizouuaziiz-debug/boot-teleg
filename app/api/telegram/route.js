import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
  // ⭐️ استخراج كود الإحالة من الرابط (إذا وجد)
  const startParam = ctx.startPayload || "";
  
  // ⭐️ بناء الرابط مع كود الإحالة
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
                url: appUrl  // ⭐️ الرابط الجديد مع كود الإحالة
              }
            }
          ]
        ]
      }
    }
  );
});

export async function POST(req) {
  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[Bot] Error:", err);
    return Response.json(
      { error: "Webhook failed" },
      { status: 500 }
    );
  }
}
