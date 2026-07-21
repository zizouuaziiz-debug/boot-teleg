import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token || !verifySessionToken(token)) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const { message, imageUrl } = body;

  if (!message && !imageUrl) {
    return NextResponse.json(
      { error: "Message or image required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // منع إنشاء Broadcast جديد إذا كان هناك واحد يعمل
  const { data: running, error: runningError } = await supabase
    .from("broadcast_logs")
    .select("id")
    .eq("status", "running")
    .limit(1);

  if (runningError) {
    return NextResponse.json(
      { error: runningError.message },
      { status: 500 }
    );
  }

  if (running && running.length > 0) {
    return NextResponse.json(
      { error: "Broadcast already in progress" },
      { status: 409 }
    );
  }

  // إنشاء Broadcast جديد فقط
  const { data: log, error } = await supabase
    .from("broadcast_logs")
    .insert({
      message: message ?? "",
      image_url: imageUrl || null,
      status: "running",
      total_users: 0,
      success_count: 0,
      failed_count: 0,
      locked_at: null,
    })
    .select()
    .single();

  if (error || !log) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to create broadcast",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Broadcast queued successfully.",
    broadcastId: log.id,
  });
}
