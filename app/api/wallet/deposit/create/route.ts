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

  // ⭐️ TRC20 = نظامنا الخاص
  if (network === "tron") {
    const orderId = `dep_${user.id}_${Date.now()}`;
    try {
      const payment = await createPayment({
        amountUSD: numAmount,
        network: "tron",
        orderId,
        callbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
      });

      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "deposit",
        amount: numAmount,
        status: "pending",
        source: `system:${payment.payment_id}`,
        address: payment.payment_address,
      });

      return NextResponse.json({
        mode: "nowpayments",
        payment_id: payment.payment_id,
        payment_address: payment.payment_address,
        pay_amount: payment.pay_amount,
        pay_currency: "usdttrc20",
        expiry: payment.expiry,
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
  }

  // ⭐️ ERC20 و BEP20 = عناوين ثابتة من الأدمن
  const { data: cfg } = await supabase
    .from("admin_config")
    .select("deposit_addresses")
    .eq("id", 1)
    .maybeSingle();

  const addresses = (cfg?.deposit_addresses as Record<string, string>) ?? {};
  const depositAddress = network === "eth" ? addresses.eth : addresses.bsc;

  if (!depositAddress) {
    return NextResponse.json({
      error: "Deposits are temporarily unavailable. Please contact support.",
    }, { status: 503 });
  }

  await supabase.from("transactions").insert({
    user_id: user.id,
    type: "deposit",
    amount: numAmount,
    status: "pending",
    source: network,
    address: depositAddress,
  });

  return NextResponse.json({
    mode: "static",
    payment_address: depositAddress,
    pay_amount: numAmount,
    pay_currency: network === "eth" ? "usdterc20" : "usdtbsc",
    expiry: null,
  });
}
