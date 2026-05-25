import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_MINING_RATES } from "@/lib/mining-config";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("mining_config")
      .eq("id", 1)
      .single();

    // Use saved config from DB, fall back to code defaults only if nothing saved yet
    const config = (data?.mining_config && Object.keys(data.mining_config).length > 0)
      ? data.mining_config
      : DEFAULT_MINING_RATES;

    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ config: DEFAULT_MINING_RATES });
  }
}
