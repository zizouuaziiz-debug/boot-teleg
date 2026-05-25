import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { DEFAULT_VIP_PLANS } from "@/lib/vip-config";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("vip_config")
      .eq("id", 1)
      .single();

    const plans = (data?.vip_config && Array.isArray(data.vip_config) && data.vip_config.length > 0)
      ? data.vip_config
      : DEFAULT_VIP_PLANS;

    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ plans: DEFAULT_VIP_PLANS });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { plans } = body;

    if (!plans || !Array.isArray(plans)) {
      return NextResponse.json({ error: "Invalid plans format" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("admin_config")
      .upsert({ id: 1, vip_config: plans, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: "VIP config saved successfully." });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
