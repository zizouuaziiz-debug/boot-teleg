/**
 * Internal referral reward credit helper.
 * Not a user-facing endpoint — used server-side via direct import.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

export async function creditReferralReward(
  userId: string,
  earnedAmount: number
): Promise<void> {
  if (earnedAmount <= 0) return;

  try {
    const supabase = getSupabaseAdmin();

    const { data: referral } = await supabase
      .from("referrals")
      .select("referrer_id, earnings")
      .eq("referred_id", userId)
      .maybeSingle();

    if (!referral?.referrer_id) return;

    const { data: cfg } = await supabase
      .from("admin_config")
      .select("referral_commission")
      .eq("id", 1)
      .maybeSingle();

    const commissionPct = Number(cfg?.referral_commission ?? 10) / 100;
    const commission = Math.round(earnedAmount * commissionPct * 1e8) / 1e8;

    if (commission <= 0) return;

    const { data: rWallet } = await supabase
      .from("wallets")
      .select("balance, total_earned, total_withdrawn, coins")
      .eq("user_id", referral.referrer_id)
      .maybeSingle();

    if (rWallet) {
      const newWallet = {
        balance: Number(rWallet.balance) + commission,
        total_earned: Number(rWallet.total_earned) + commission,
        total_withdrawn: Number(rWallet.total_withdrawn),
        coins: Number(rWallet.coins),
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from("wallets")
        .update(newWallet)
        .eq("user_id", referral.referrer_id);

      await broadcastWalletUpdate(referral.referrer_id, newWallet);
    }

    await supabase.from("referrals").update({
      earnings: Number(referral.earnings ?? 0) + commission,
    }).eq("referred_id", userId);

    await supabase.from("transactions").insert({
      user_id: referral.referrer_id,
      type: "referral",
      amount: commission,
      status: "completed",
      source: `ref_commission:${userId}`,
    });

  } catch {
    // non-fatal
  }
}
