import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { telegramId, message } = body;

  if (!telegramId || !message) {
    return NextResponse.json({ error: "telegramId and message required" }, { status: 400 });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "Bot token missing" }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: message }),
    });
    
    const data = await res.json();
    
    if (data.ok) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: data.description }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
