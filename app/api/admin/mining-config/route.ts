import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { DEFAULT_MINING_RATES } from "@/lib/mining-config";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("mining_config")
      .eq("id", 1)
      .single();

    // Admin panel expects { rates: {...} }
    const rates = (data?.mining_config && Object.keys(data.mining_config).length > 0)
      ? data.mining_config
      : DEFAULT_MINING_RATES;

    return NextResponse.json({ rates });
  } catch {
    return NextResponse.json({ rates: DEFAULT_MINING_RATES });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    // Admin panel sends { rates: {...} }
    const rates = body.rates ?? body.config;

    if (!rates || typeof rates !== "object") {
      return NextResponse.json({ error: "Invalid config format" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("admin_config")
      .upsert({ id: 1, mining_config: rates, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: "Mining rates saved successfully." });
  } catch {
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
