import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
  await ctx.reply("🚀 افتح التطبيق", {
    reply_markup: {
      inline_keyboard: [[
        {
          text: "🚀 Open App",
          web_app: {
            url: "https://boot-teleg-psi.vercel.app"
          }
        }
      ]]
    }
  });
});

export async function POST(req) {
  try {

    const body = await req.json();

    await bot.handleUpdate(body);

    return Response.json({ ok: true });

  } catch (err) {

    console.error(err);

    return Response.json(
      { error: "Webhook failed" },
      { status: 500 }
    );
  }
}
