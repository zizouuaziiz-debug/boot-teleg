import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: deposits } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", "deposit")
    .order("created_at", { ascending: false })
    .limit(20);

  // Get configured deposit addresses (fallback mode)
  const { data: cfg } = await supabase
    .from("admin_config").select("deposit_addresses").eq("id", 1).maybeSingle();
  const addresses = (cfg?.deposit_addresses as Record<string, string>) ?? {};

  return NextResponse.json({
    deposits:  deposits ?? [],
    addresses: {
      tron: addresses.tron ?? "",
      eth:  addresses.eth  ?? "",
      bsc:  addresses.bsc  ?? "",
    },
  });
}
