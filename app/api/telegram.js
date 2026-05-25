import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);

// =======================
// START COMMAND
// =======================
bot.start((ctx) => {
  return ctx.reply("🚀 افتح التطبيق", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚀 Open App",
            web_app: {
              url: "https://boot-teleg-psi.vercel.app" // ❗ بدون /
            },
          },
        ],
      ],
    },
  });
});

// =======================
// WEBHOOK HANDLER
// =======================
export default async function handler(req, res) {
  try {
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error("Bot error:", err);
  }

  res.status(200).send("ok");
}
