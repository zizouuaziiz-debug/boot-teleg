import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { message } = body;

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // broadcast to all users
  await supabase.channel("admin:live").send({
    type: "broadcast",
    event: "admin_notification",
    payload: { message, time: new Date().toISOString() },
  });

  return NextResponse.json({ success: true });
}
