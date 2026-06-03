import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createPayment, isConfigured } from "@/lib/nowpayments";

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  
  if (!telegramId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { amount, network = "tron" } = body as { amount?: number; network?: "tron" | "eth" | "bsc" };

  // ✅ تم إصلاح الخطأ: إزالة السطر المكرر
  if (!amount || isNaN(Number(amount)) || Number(amount) < 5) {
    return NextResponse.json({ error: "Minimum deposit is $5" }, { status: 400 });
  }

  const { data: user } = await supabase.from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
    
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const numAmount = Number(amount);
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

  // ── Try NOWPayments first ──────────────────────────────────────────────────
  const nowConfigured = await isConfigured();
  if (nowConfigured) {
    try {
      const orderId = `dep_${user.id}_${Date.now()}`;
      const payment = await createPayment({
        amountUSD:   numAmount,
        network:     network as "tron" | "eth" | "bsc",
        orderId,
        callbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
      });

      const { data: tx } = await supabase.from("transactions").insert({
        user_id: user.id,
        type:    "deposit",
        amount:  numAmount,
        status:  "pending",
        source:  `nowpayments:${payment.payment_id}`,
        address: payment.payment_address,
      }).select().single();

      return NextResponse.json({
        mode:            "nowpayments",
        payment_id:      payment.payment_id,
        payment_address: payment.payment_address,
        pay_amount:      payment.pay_amount,
        pay_currency:    payment.pay_currency,
        expiry:          payment.expiry,
        transaction_id:  tx?.id,
      });
    } catch (e) {
      console.error("NOWPayments create error, falling back to static:", e);
    }
  }

  // ── Fallback: static deposit addresses from admin config ──────────────────
  const { data: cfg } = await supabase.from("admin_config")
    .select("deposit_addresses").eq("id", 1).maybeSingle();
  const addresses = (cfg?.deposit_addresses as Record<string, string>) ?? {};

  const networkAddressMap: Record<string, string> = {
    tron: addresses.tron ?? "",
    eth:  addresses.eth  ?? "",
    bsc:  addresses.bsc  ?? "",
  };
  const depositAddress = networkAddressMap[network] ?? "";

  if (!depositAddress) {
    return NextResponse.json({
      error: "Deposits are temporarily unavailable. Please contact support.",
    }, { status: 503 });
  }

  const { data: tx } = await supabase.from("transactions").insert({
    user_id: user.id,
    type:    "deposit",
    amount:  numAmount,
    status:  "pending",
    source:  network,
    address: depositAddress,
  }).select().single();

  return NextResponse.json({
    mode:            "static",
    payment_address: depositAddress,
    pay_amount:      numAmount,
    pay_currency:    network === "tron" ? "USDT-TRC20" : network === "eth" ? "USDT-ERC20" : "USDT-BEP20",
    expiry:          null,
    transaction_id:  tx?.id,
  });
}
