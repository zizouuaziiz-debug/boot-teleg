// lib/nowpayment.ts
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";
import { generateWallet } from "./wallet";
import {
  getTronWeb,
  USDT_CONTRACT,
  usdtToSun,
} from "./tronweb";
import { calculateFees, getFeeConfig, checkIncomingTransactions } from "./transactions";

const BASE = "https://api.nowpayments.io/v1";

export const NWP_CURRENCY_MAP: Record<string, string> = {
  tron: "usdttrc20",
  eth:  "usdterc20",
  bsc:  "usdtbsc",
};

export interface NowpaymentsConfig {
  apiKey:    string;
  ipnSecret: string;
  masterWallet: string;
  platformFee: number;
  escrowFee: number;
}

export async function getNowpaymentsConfig(): Promise<NowpaymentsConfig> {
  const envKey    = process.env.NOWPAYMENTS_API_KEY    ?? "";
  const envSecret = process.env.NOWPAYMENTS_IPN_SECRET ?? "";
  const envMaster = process.env.MASTER_WALLET_ADDRESS  ?? "";
  
  if (envKey) {
    return {
      apiKey: envKey,
      ipnSecret: envSecret,
      masterWallet: envMaster,
      platformFee: Number(process.env.PLATFORM_FEE) || 2,
      escrowFee: Number(process.env.ESCROW_FEE) || 1,
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("nowpayments_config")
      .eq("id", 1)
      .maybeSingle();
    
    const cfg = (data?.nowpayments_config as Record<string, any>) ?? {};
    return {
      apiKey:      cfg.apiKey      ?? "",
      ipnSecret:   cfg.ipnSecret   ?? "",
      masterWallet: cfg.masterWallet ?? "",
      platformFee:  cfg.platformFee ?? 2,
      escrowFee:    cfg.escrowFee   ?? 1,
    };
  } catch {
    return {
      apiKey: "", ipnSecret: "", masterWallet: "",
      platformFee: 2, escrowFee: 1,
    };
  }
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getNowpaymentsConfig();
  return !!cfg.masterWallet || !!cfg.apiKey;
}

function supabase() {
  return getSupabaseAdmin();
}

// ⭐️ دالة البث المباشر
async function broadcastToLiveFeed(event: string, payload: Record<string, unknown>) {
  try {
    const supabaseClient = supabase();
    await supabaseClient.channel("admin:live").send({
      type: "broadcast",
      event,
      payload,
    });
  } catch (error) {
    console.error("Broadcast error:", error);
  }
}

export async function createPayment(opts: {
  amountUSD:   number;
  network:     "tron" | "eth" | "bsc";
  orderId:     string;
  callbackUrl: string;
}): Promise<{
  payment_id:      string;
  payment_address: string;
  pay_amount:      number;
  pay_currency:    string;
  status:          string;
  expiry:          string | null;
}> {
  const config = await getNowpaymentsConfig();
  
  if (opts.network !== "tron") {
    if (config.apiKey) return createPaymentLegacy(opts, config);
    throw new Error("Only TRON network is supported currently");
  }

  try {
    if (!config.masterWallet && !process.env.MASTER_WALLET_ADDRESS) {
      throw new Error("Master wallet not configured");
    }

    const feeConfig = await getFeeConfig();
    const fees = calculateFees(opts.amountUSD, feeConfig, false);
    const wallet = await generateWallet();
    const expiryDate = new Date(Date.now() + 3600000);
    
    const { data: payment, error } = await supabase()
      .from("payments")
      .insert({
        order_id:               opts.orderId,
        amount:                 opts.amountUSD,
        platform_fee:           fees.platformFee,
        net_amount:             fees.netAmount,
        wallet_address:         wallet.address,
        encrypted_private_key:  wallet.encryptedPrivateKey,
        pay_currency:           "usdttrc20",
        network:                opts.network,
        callback_url:           opts.callbackUrl,
        status:                 "PENDING",
        expires_at:             expiryDate.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }
    
    // ⭐️ بث حدث إيداع معلق
    await broadcastToLiveFeed("deposit_pending", {
      userId: opts.orderId,
      amount: opts.amountUSD,
      id: payment.id,
    });
    
    return {
      payment_id:      payment.id,
      payment_address: wallet.address,
      pay_amount:      opts.amountUSD,
      pay_currency:    "usdttrc20",
      status:          "waiting",
      expiry:          expiryDate.toISOString(),
    };
  } catch (error: any) {
    console.error("Create payment error:", error);
    throw new Error(error.message || "Failed to create payment");
  }
}

async function createPaymentLegacy(
  opts: { amountUSD: number; network: "tron" | "eth" | "bsc"; orderId: string; callbackUrl: string },
  config: NowpaymentsConfig
) {
  const payCurrency = NWP_CURRENCY_MAP[opts.network] ?? "usdttrc20";
  const res = await fetch(`${BASE}/payment`, {
    method: "POST",
    headers: { "x-api-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount:     opts.amountUSD,
      price_currency:   "usd",
      pay_currency:     payCurrency,
      order_id:         opts.orderId,
      ipn_callback_url: opts.callbackUrl,
      is_fixed_rate:    false,
      is_fee_paid_by_user: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NOWPayments error ${res.status}: ${err}`);
  }
  const d = await res.json();
  return {
    payment_id:      String(d.payment_id),
    payment_address: d.pay_address,
    pay_amount:      d.pay_amount,
    pay_currency:    d.pay_currency,
    status:          d.payment_status,
    expiry:          d.expiration_estimate_date ?? null,
  };
}

export async function getPaymentStatus(paymentId: string): Promise<{
  status:        string;
  actually_paid: number;
  pay_amount:    number;
}> {
  try {
    const { data: payment, error } = await supabase()
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (error || !payment) throw new Error("Payment not found");
    
    if (payment.status === "COMPLETED") {
      return {
        status:        "finished",
        actually_paid: payment.actually_paid || payment.amount,
        pay_amount:    payment.amount,
      };
    }
    
    if (payment.expires_at && new Date(payment.expires_at) < new Date()) {
      return { status: "expired", actually_paid: 0, pay_amount: payment.amount };
    }
    
    const result = await checkIncomingTransactions(
      payment.wallet_address,
      new Date(payment.created_at).getTime(),
      payment.amount
    );
    
    if (result.found) {
      await supabase()
        .from("payments")
        .update({
          status:        "COMPLETED",
          tx_id:         result.transactions[0]?.txId,
          completed_at:  new Date().toISOString(),
          actually_paid: result.totalReceived,
        })
        .eq("id", paymentId);
      
      // ⭐️ بث حدث إيداع مكتمل
      await broadcastToLiveFeed("deposit_confirmed", {
        userId: payment.order_id,
        amount: result.totalReceived,
        txId: result.transactions[0]?.txId,
        id: paymentId,
      });
      
      if (payment.callback_url) {
        sendCallback(payment.callback_url, {
          payment_id:     paymentId,
          payment_status: "finished",
          actually_paid:  result.totalReceived,
          pay_amount:     payment.amount,
          order_id:       payment.order_id,
        }).catch(console.error);
      }
      
      return {
        status:        "finished",
        actually_paid: result.totalReceived,
        pay_amount:    payment.amount,
      };
    }
    
    if (result.totalReceived > 0) {
      return {
        status:        "partially_paid",
        actually_paid: result.totalReceived,
        pay_amount:    payment.amount,
      };
    }
    
    return { status: "waiting", actually_paid: 0, pay_amount: payment.amount };
    
  } catch (error) {
    console.error("Get payment status error:", error);
    const { data: payment } = await supabase()
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();
      
    if (payment?.status === "COMPLETED") {
      return {
        status:        "finished",
        actually_paid: payment.actually_paid || payment.amount,
        pay_amount:    payment.amount,
      };
    }
    throw error;
  }
}

async function sendCallback(url: string, data: any) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error("Failed to send callback:", error);
  }
}

export async function createPayout(opts: {
  address:     string;
  amountUSDT:  number;
  currency?:   string;
  callbackUrl: string;
  ipn_id:      string;
}): Promise<{ id: string; status: string }> {
  const config = await getNowpaymentsConfig();
  
  if (opts.currency && opts.currency !== "usdttrc20") {
    if (config.apiKey) return createPayoutLegacy(opts, config);
    throw new Error("Only TRC20 payouts are supported");
  }
  
  try {
    const tronWeb = getTronWeb();
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    
    const tx = await contract.transfer(
      opts.address,
      usdtToSun(opts.amountUSDT)
    ).send({ feeLimit: 40_000_000 });
    
    const { data: payout, error } = await supabase()
      .from("payouts")
      .insert({
        address:      opts.address,
        amount:       opts.amountUSDT,
        currency:     "usdttrc20",
        tx_id:        tx,
        ipn_id:       opts.ipn_id,
        callback_url: opts.callbackUrl,
        status:       "completed",
      })
      .select()
      .single();

    if (error) throw error;
    
    // ⭐️ بث حدث سحب
    await broadcastToLiveFeed("withdraw_pending", {
      id: payout.id,
      amount: opts.amountUSDT,
      txId: tx,
      status: "completed",
    });
    
    if (opts.callbackUrl) {
      sendCallback(opts.callbackUrl, {
        id: payout.id,
        status: "completed",
        txid: tx,
      }).catch(console.error);
    }
    
    return { id: payout.id, status: "completed" };
    
  } catch (error) {
    console.error("Create payout error:", error);
    throw new Error("Failed to create payout");
  }
}

async function createPayoutLegacy(
  opts: { address: string; amountUSDT: number; currency?: string; callbackUrl: string; ipn_id: string },
  config: NowpaymentsConfig
) {
  const res = await fetch(`${BASE}/payout`, {
    method: "POST",
    headers: { "x-api-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      withdrawals: [{
        address:          opts.address,
        currency:         opts.currency ?? "usdttrc20",
        amount:           opts.amountUSDT,
        ipn_callback_url: opts.callbackUrl,
        id:               opts.ipn_id,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NOWPayments payout error ${res.status}: ${err}`);
  }
  const d = await res.json();
  const w = d.withdrawals?.[0];
  return { id: String(w?.id ?? ""), status: w?.status ?? "created" };
}

export async function verifyWebhookSignature(
  body:      Record<string, unknown>,
  signature: string
): Promise<boolean> {
  const { ipnSecret } = await getNowpaymentsConfig();
  if (!ipnSecret) return true;
  
  try {
    const sorted = Object.keys(body)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = body[k];
        return acc;
      }, {});
    
    const message  = JSON.stringify(sorted);
    const expected = crypto.createHmac("sha512", ipnSecret).update(message).digest("hex");
    return expected === signature;
  } catch {
    return false;
  }
}
