import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";

const BASE = "https://api.nowpayments.io/v1";

export const NWP_CURRENCY_MAP: Record<string, string> = {
  tron: "usdttrc20",
  eth:  "usdterc20",
  bsc:  "usdtbsc",
};

/* ── Dynamic config: env vars first, then admin_config DB ─────────────────── */
export interface NowpaymentsConfig {
  apiKey:    string;
  ipnSecret: string;
}

export async function getNowpaymentsConfig(): Promise<NowpaymentsConfig> {
  const envKey    = process.env.NOWPAYMENTS_API_KEY    ?? "";
  const envSecret = process.env.NOWPAYMENTS_IPN_SECRET ?? "";
  if (envKey) return { apiKey: envKey, ipnSecret: envSecret };

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("nowpayments_config")
      .eq("id", 1)
      .maybeSingle();
    const cfg = (data?.nowpayments_config as Record<string, string>) ?? {};
    return {
      apiKey:    cfg.apiKey    ?? "",
      ipnSecret: cfg.ipnSecret ?? "",
    };
  } catch {
    return { apiKey: "", ipnSecret: "" };
  }
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getNowpaymentsConfig();
  return !!cfg.apiKey;
}

/* ── Create payment invoice ───────────────────────────────────────────────── */
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
  const { apiKey } = await getNowpaymentsConfig();
  if (!apiKey) throw new Error("NOWPayments API key not configured");

  const payCurrency = NWP_CURRENCY_MAP[opts.network] ?? "usdttrc20";
  const res = await fetch(`${BASE}/payment`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount:        opts.amountUSD,
      price_currency:      "usd",
      pay_currency:        payCurrency,
      order_id:            opts.orderId,
      ipn_callback_url:    opts.callbackUrl,
      is_fixed_rate:       false,
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

/* ── Check payment status ─────────────────────────────────────────────────── */
export async function getPaymentStatus(paymentId: string): Promise<{
  status:        string;
  actually_paid: number;
  pay_amount:    number;
}> {
  const { apiKey } = await getNowpaymentsConfig();
  const res = await fetch(`${BASE}/payment/${paymentId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`NOWPayments status error ${res.status}`);
  const d = await res.json();
  return {
    status:        d.payment_status,
    actually_paid: Number(d.actually_paid ?? 0),
    pay_amount:    Number(d.pay_amount    ?? 0),
  };
}

/* ── Create payout ────────────────────────────────────────────────────────── */
export async function createPayout(opts: {
  address:     string;
  amountUSDT:  number;
  currency?:   string;
  callbackUrl: string;
  ipn_id:      string;
}): Promise<{ id: string; status: string }> {
  const { apiKey } = await getNowpaymentsConfig();
  if (!apiKey) throw new Error("NOWPayments API key not configured");

  const res = await fetch(`${BASE}/payout`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
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

/* ── Verify IPN signature ─────────────────────────────────────────────────── */
export async function verifyWebhookSignature(
  body:      Record<string, unknown>,
  signature: string
): Promise<boolean> {
  const { ipnSecret } = await getNowpaymentsConfig();
  if (!ipnSecret) return true; // dev mode
  try {
    const sorted   = Object.keys(body).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = body[k]; return acc; }, {});
    const message  = JSON.stringify(sorted);
    const expected = crypto.createHmac("sha512", ipnSecret).update(message).digest("hex");
    return expected === signature;
  } catch {
    return false;
  }
}
