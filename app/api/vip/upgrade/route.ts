import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_VIP_PLANS } from "@/lib/vip-config";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // Accept both "targetLevel" (from profile-screen) and "level" (legacy)
  const level: number = body.targetLevel ?? body.level;

  if (!level || typeof level !== "number") {
    return NextResponse.json({ error: "Invalid VIP level" }, { status: 400 });
  }

  // Load VIP plans from DB or fall back to defaults
  const { data: adminCfg } = await supabase
    .from("admin_config")
    .select("vip_config")
    .eq("id", 1)
    .maybeSingle();

  const plans =
    (adminCfg?.vip_config && Array.isArray(adminCfg.vip_config) && adminCfg.vip_config.length > 0)
      ? adminCfg.vip_config
      : DEFAULT_VIP_PLANS;

  const plan = plans.find((p: { level: number }) => p.level === level);
  if (!plan || plan.level === 0) {
    return NextResponse.json({ error: "Invalid VIP level" }, { status: 400 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, vip_level")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.vip_level >= level) {
    return NextResponse.json({ error: "Already at or above this VIP level" }, { status: 400 });
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, total_withdrawn")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!wallet || Number(wallet.balance) < plan.price) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  await supabase
    .from("wallets")
    .update({ balance: Number(wallet.balance) - plan.price, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  await supabase
    .from("users")
    .update({ vip_level: level, updated_at: new Date().toISOString() })
    .eq("telegram_id", telegramId);

  await supabase.from("transactions").insert({
    user_id: user.id,
    type:    "vip_upgrade",
    amount:  -plan.price,
    status:  "completed",
    source:  `VIP ${plan.name} Upgrade`,
  });

  return NextResponse.json({ success: true, newLevel: level });
}
