/**
 * Creates a new referral record when a user signs up with a referral code.
 * Must be called BEFORE creditReferralReward.
 */

import { getSupabaseAdmin } from "@/lib/supabase";

export async function createReferral(
  referrerId: string,
  referredId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseAdmin();

    // Check if referral already exists
    const { data: existing, error: checkError } = await supabase
      .from("referrals")
      .select("id")
      .eq("referred_id", referredId)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing referral:", checkError);
      return { success: false, error: "Database error" };
    }

    if (existing) {
      return { success: false, error: "Referral already exists" };
    }

    // Create new referral record
    const { error: insertError } = await supabase
      .from("referrals")
      .insert({
        referrer_id: referrerId,
        referred_id: referredId,
        earnings: 0,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error creating referral:", insertError);
      return { success: false, error: "Failed to create referral" };
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error in createReferral:", error);
    return { success: false, error: "Unexpected error" };
  }
}
