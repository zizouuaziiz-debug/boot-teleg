import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_VIP_PLANS } from "@/lib/vip-config";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("vip_config")
      .eq("id", 1)
      .single();

    // Use saved config from DB, fall back to code defaults only if nothing saved yet
    const plans = (data?.vip_config && Array.isArray(data.vip_config) && data.vip_config.length > 0)
      ? data.vip_config
      : DEFAULT_VIP_PLANS;

    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ plans: DEFAULT_VIP_PLANS });
  }
}
