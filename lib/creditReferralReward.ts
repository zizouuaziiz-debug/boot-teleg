/**
 * Internal referral reward credit helper.
 * Not a user-facing endpoint — used server-side via direct import.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

export async function creditReferralReward(
  userId: string,
  earnedAmount: number
): Promise<{ success: boolean; error?: string }> {
  if (earnedAmount <= 0) {
    return { success: false, error: "Amount must be greater than 0" };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find referral record
    const { data: referral, error: referralError } = await supabase
      .from("referrals")
      .select("id, referrer_id, earnings")
      .eq("referred_id", userId)
      .maybeSingle();

    if (referralError) {
      console.error("Error fetching referral:", referralError);
      return { success: false, error: "Database error" };
    }

    if (!referral?.referrer_id) {
      return { success: false, error: "No referral found for this user" };
    }

    // Get commission configuration
    const { data: cfg, error: configError } = await supabase
      .from("admin_config")
      .select("referral_commission")
      .eq("id", 1)
      .maybeSingle();

    if (configError) {
      console.error("Error fetching config:", configError);
      return { success: false, error: "Config error" };
    }

    const commissionPct = Number(cfg?.referral_commission ?? 10) / 100;
    const commission = Math.round(earnedAmount * commissionPct * 1e8) / 1e8;

    if (commission <= 0) {
      return { success: false, error: "Commission too small" };
    }

    // Get referrer's wallet
    const { data: rWallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance, total_earned, total_withdrawn, coins")
      .eq("user_id", referral.referrer_id)
      .maybeSingle();

    if (walletError) {
      console.error("Error fetching wallet:", walletError);
      return { success: false, error: "Wallet error" };
    }

    if (rWallet) {
      const newWallet = {
        balance: Number(rWallet.balance) + commission,
        total_earned: Number(rWallet.total_earned) + commission,
        total_withdrawn: Number(rWallet.total_withdrawn),
        coins: Number(rWallet.coins),
        updated_at: new Date().toISOString(),
      };

      const { error: updateWalletError } = await supabase
        .from("wallets")
        .update(newWallet)
        .eq("user_id", referral.referrer_id);

      if (updateWalletError) {
        console.error("Error updating wallet:", updateWalletError);
        return { success: false, error: "Failed to update wallet" };
      }

      await broadcastWalletUpdate(referral.referrer_id, newWallet);
    }

    // Update referral earnings
    const newEarnings = Number(referral.earnings ?? 0) + commission;
    const { error: updateReferralError } = await supabase
      .from("referrals")
      .update({ earnings: newEarnings })
      .eq("referred_id", userId);

    if (updateReferralError) {
      console.error("Error updating referral earnings:", updateReferralError);
      return { success: false, error: "Failed to update referral earnings" };
    }

    // Record transaction
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: referral.referrer_id,
        type: "referral",
        amount: commission,
        status: "completed",
        source: `ref_commission:${userId}`,
      });

    if (transactionError) {
      console.error("Error recording transaction:", transactionError);
      // Non-fatal, continue
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error in creditReferralReward:", error);
    return { success: false, error: "Unexpected error" };
  }
}
