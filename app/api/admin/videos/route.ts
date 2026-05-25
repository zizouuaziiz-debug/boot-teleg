import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const { data: videos } = await supabase
    .from("videos").select("*")
    .order("created_at", { ascending: false });
  return NextResponse.json({ videos: videos ?? [] });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabase
    .from("videos")
    .insert({ ...body, is_active: true })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}

/**
 * PATCH /api/admin/videos
 * Body: { id: string, is_active?: boolean }
 * Toggle video active status or update fields.
 */
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body as { id?: string; [key: string]: unknown };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("videos").update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data, success: true });
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await supabase.from("videos").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
