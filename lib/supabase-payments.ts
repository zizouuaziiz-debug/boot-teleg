// lib/supabase-payments.ts
import { getSupabaseAdmin } from "./supabase";

const admin = getSupabaseAdmin();

export async function savePayment(data: {
  orderId: string;
  amount: number;
  fee: number;
  net: number;
  walletAddress: string;
  encryptedKey: string;
  callbackUrl: string;
}) {
  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      order_id: data.orderId,
      amount: data.amount,
      platform_fee: data.fee,
      net_amount: data.net,
      wallet_address: data.walletAddress,
      encrypted_private_key: data.encryptedKey,
      callback_url: data.callbackUrl,
      status: "PENDING",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return payment;
}

export async function getPayment(id: string) {
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function markPaid(id: string, txId: string, amount: number) {
  const { error } = await admin
    .from("payments")
    .update({
      status: "COMPLETED",
      tx_id: txId,
      actually_paid: amount,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

export async function getPendingPayments() {
  const { data } = await admin
    .from("payments")
    .select("*")
    .eq("status", "PENDING")
    .gt("expires_at", new Date().toISOString());

  return data || [];
}

export async function savePayout(data: {
  address: string;
  amount: number;
  txId: string;
  ipnId: string;
  callbackUrl: string;
}) {
  const { data: payout, error } = await admin
    .from("payouts")
    .insert({
      address: data.address,
      amount: data.amount,
      tx_id: data.txId,
      ipn_id: data.ipnId,
      callback_url: data.callbackUrl,
      status: "completed",
    })
    .select()
    .single();

  if (error) throw error;
  return payout;
}
