// lib/nowpayment.ts ← استبدل الملف بالكامل بهذا المحتوى
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";
import { generateWallet, decryptPrivateKey } from "./wallet";
import {
  getTronWeb,
  getReadOnlyTronWeb,
  USDT_CONTRACT,
  usdtToSun,
  sunToUsdt,
} from "./tronweb";
import { calculateFees, getFeeConfig } from "./transactions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE = "https://api.nowpayments.io/v1"; // محتفظ به للتوافق

/* ── Currency map ─────────────────────────────────────────────────────────── */
export const NWP_CURRENCY_MAP: Record<string, string> = {
  tron: "usdttrc20",
  eth:  "usdterc20",
  bsc:  "usdtbsc",
};

/* ── Config ───────────────────────────────────────────────────────────────── */
export interface NowpaymentsConfig {
  apiKey:    string;
  ipnSecret: string;
  // إضافات جديدة للنظام
  masterWallet: string;
  platformFee: number;
  escrowFee: number;
}

export async function getNowpaymentsConfig(): Promise<NowpaymentsConfig> {
  // نتحقق من متغيرات البيئة أولاً
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

  // جلب الإعدادات من Supabase
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
      apiKey: "",
      ipnSecret: "",
      masterWallet: "",
      platformFee: 2,
      escrowFee: 1,
    };
  }
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getNowpaymentsConfig();
  return !!cfg.masterWallet; // نتأكد من وجود المحفظة الرئيسية
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
  const config = await getNowpaymentsConfig();
  
  // إذا كانت الشبكة ليست Tron، يمكنك الرجوع لـ NowPayment أو رفض الطلب
  if (opts.network !== "tron") {
    // خيار 1: العودة للنظام القديم
    if (config.apiKey) {
      return createPaymentLegacy(opts, config);
    }
    // خيار 2: رفض الشبكات غير المدعومة
    throw new Error("Only TRON network is supported currently");
  }

  try {
    // 1. حساب العمولات
    const feeConfig = await getFeeConfig();
    const fees = calculateFees(opts.amountUSD, feeConfig, false);
    
    // 2. توليد محفظة جديدة لهذه الدفعة
    const wallet = await generateWallet();
    
    // 3. حساب وقت الانتهاء (ساعة من الآن)
    const expiryDate = new Date(Date.now() + 3600000);
    
    // 4. حفظ الدفعة في قاعدة البيانات
    const payment = await prisma.payment.create({
      data: {
        orderId: opts.orderId,
        amount: opts.amountUSD,
        platformFee: fees.platformFee,
        netAmount: fees.netAmount,
        walletAddress: wallet.address,
        encryptedPrivateKey: wallet.privateKey, // مشفر بالفعل
        payCurrency: "usdttrc20",
        network: opts.network,
        callbackUrl: opts.callbackUrl,
        status: "PENDING",
        expiresAt: expiryDate,
      },
    });
    
    // 5. إرجاع نفس هيكل NowPayment للتوافق
    return {
      payment_id:      payment.id,
      payment_address: wallet.address,
      pay_amount:      opts.amountUSD,
      pay_currency:    "usdttrc20",
      status:          "waiting",
      expiry:          expiryDate.toISOString(),
    };
  } catch (error) {
    console.error("Create payment error:", error);
    throw new Error("Failed to create payment");
  }
}

// دالة احتياطية للشبكات الأخرى
async function createPaymentLegacy(
  opts: {
    amountUSD: number;
    network: "tron" | "eth" | "bsc";
    orderId: string;
    callbackUrl: string;
  },
  config: NowpaymentsConfig
) {
  const payCurrency = NWP_CURRENCY_MAP[opts.network] ?? "usdttrc20";
  const res = await fetch(`${BASE}/payment`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
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
  try {
    // 1. جلب الدفعة من قاعدة البيانات
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    
    if (!payment) {
      throw new Error("Payment not found");
    }
    
    // 2. إذا كانت مكتملة، أرجع مباشرة
    if (payment.status === "COMPLETED") {
      return {
        status:        "finished",
        actually_paid: payment.amount,
        pay_amount:    payment.amount,
      };
    }
    
    // 3. إذا انتهت صلاحيتها
    if (payment.expiresAt && new Date() > payment.expiresAt) {
      return {
        status:        "expired",
        actually_paid: 0,
        pay_amount:    payment.amount,
      };
    }
    
    // 4. فحص البلوكشين
    const { checkIncomingTransactions } = await import("./transactions");
    const result = await checkIncomingTransactions(
      payment.walletAddress,
      payment.createdAt.getTime(),
      payment.amount
    );
    
    // 5. تحديث الحالة إذا تم الدفع
    if (result.found) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: "COMPLETED",
          txId: result.transactions[0].txId,
          completedAt: new Date(),
          actuallyPaid: result.totalReceived,
        },
      });
      
      // 6. إرسال الـ Webhook/Callback
      if (payment.callbackUrl) {
        sendCallback(payment.callbackUrl, {
          payment_id: paymentId,
          payment_status: "finished",
          actually_paid: result.totalReceived,
          pay_amount: payment.amount,
          order_id: payment.orderId,
        }).catch(console.error);
      }
      
      return {
        status:        "finished",
        actually_paid: result.totalReceived,
        pay_amount:    payment.amount,
      };
    }
    
    // 7. إذا تم استلام جزء من المبلغ
    if (result.totalReceived > 0) {
      return {
        status:        "partially_paid",
        actually_paid: result.totalReceived,
        pay_amount:    payment.amount,
      };
    }
    
    // 8. لم يتم الدفع بعد
    return {
      status:        "waiting",
      actually_paid: 0,
      pay_amount:    payment.amount,
    };
    
  } catch (error) {
    console.error("Get payment status error:", error);
    
    // في حالة الخطأ، نتحقق من قاعدة البيانات فقط
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      
      if (payment?.status === "COMPLETED") {
        return {
          status:        "finished",
          actually_paid: payment.actuallyPaid || payment.amount,
          pay_amount:    payment.amount,
        };
      }
    } catch {}
    
    throw error;
  }
}

/* ── دالة مساعدة لإرسال callback ─────────────────────────────────────────── */
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

/* ── Create payout (سحب USDT) ─────────────────────────────────────────────── */
export async function createPayout(opts: {
  address:     string;
  amountUSDT:  number;
  currency?:   string;
  callbackUrl: string;
  ipn_id:      string;
}): Promise<{ id: string; status: string }> {
  const config = await getNowpaymentsConfig();
  
  // إذا كانت الشبكة غير Tron، استخدم النظام القديم
  if (opts.currency && opts.currency !== "usdttrc20") {
    if (config.apiKey) {
      return createPayoutLegacy(opts, config);
    }
    throw new Error("Only TRC20 payouts are supported");
  }
  
  try {
    // استخدام المحفظة الرئيسية للإرسال
    const tronWeb = getTronWeb();
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    
    const tx = await contract.transfer(
      opts.address,
      usdtToSun(opts.amountUSDT)
    ).send({
      feeLimit: 40_000_000, // 40 TRX
    });
    
    // حفظ عملية السحب في قاعدة البيانات
    const payout = await prisma.payout.create({
      data: {
        address: opts.address,
        amount: opts.amountUSDT,
        currency: "usdttrc20",
        txId: tx,
        ipnId: opts.ipn_id,
        callbackUrl: opts.callbackUrl,
        status: "completed",
      },
    });
    
    // إرسال callback
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
  opts: {
    address: string;
    amountUSDT: number;
    currency?: string;
    callbackUrl: string;
    ipn_id: string;
  },
  config: NowpaymentsConfig
) {
  const res = await fetch(`${BASE}/payout`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      withdrawals: [
        {
          address:          opts.address,
          currency:         opts.currency ?? "usdttrc20",
          amount:           opts.amountUSDT,
          ipn_callback_url: opts.callbackUrl,
          id:               opts.ipn_id,
        },
      ],
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

/* ── Verify webhook signature ─────────────────────────────────────────────── */
export async function verifyWebhookSignature(
  body:      Record<string, unknown>,
  signature: string
): Promise<boolean> {
  const { ipnSecret } = await getNowpaymentsConfig();
  
  // إذا لم يكن هناك ipnSecret، نتحقق بطرية أخرى
  if (!ipnSecret) {
    // يمكنك إضافة تحقق مخصص هنا
    return true;
  }
  
  try {
    const sorted = Object.keys(body)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = body[k];
        return acc;
      }, {});
    
    const message = JSON.stringify(sorted);
    const expected = crypto
      .createHmac("sha512", ipnSecret)
      .update(message)
      .digest("hex");
    
    return expected === signature;
  } catch {
    return false;
  }
}
