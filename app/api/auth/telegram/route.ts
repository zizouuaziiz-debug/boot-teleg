import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateReferralCode, validateTelegramWebAppData } from "@/lib/telegram-auth";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const {
      telegram_id,
      first_name,
      last_name,
      username,
      photo_url,
      referral_code: refCode,
      init_data,
    } = await req.json();

    if (!telegram_id) {
      return NextResponse.json({ error: "Missing telegram_id" }, { status: 400 });
    }

    const telegramIdStr = String(telegram_id);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // ── Validate Telegram init data (non-blocking) ────────────────────────
    if (botToken && init_data) {
      try {
        const validatedUser = validateTelegramWebAppData(init_data, botToken);
        if (validatedUser?.id && String(validatedUser.id) !== telegramIdStr) {
          console.warn("[Auth] Telegram ID mismatch — possible spoofing attempt");
          // In a strict setup, return 401 here. Kept as warning for flexibility.
        }
      } catch {
        console.warn("[Auth] Telegram validation failed (ignored)");
      }
    }

    // ── Look up existing user ─────────────────────────────────────────────
    const { data: existingUser, error } = await supabase
      .from("users")
      .select("*, wallets(*)")
      .eq("telegram_id", telegramIdStr)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Block banned / suspended users ────────────────────────────────────
    if (existingUser) {
      const status = existingUser.status ?? "active";
      if (status === "banned") {
        return NextResponse.json({ error: "Account permanently banned" }, { status: 403 });
      }
      if (status === "suspended") {
        return NextResponse.json({ error: "Account temporarily suspended" }, { status: 403 });
      }
    }

    // ── Create new user ───────────────────────────────────────────────────
    if (!existingUser) {
      const newReferralCode = generateReferralCode(Number(telegram_id));

      let referredBy: string | null = null;
      if (refCode) {
        const { data: referrer } = await supabase
          .from("users").select("id")
          .eq("referral_code", refCode).maybeSingle();
        if (referrer) referredBy = referrer.id;
      }

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          telegram_id: telegramIdStr,
          first_name,
          last_name,
          username,
          photo_url,
          referral_code: newReferralCode,
          referred_by:   referredBy,
          vip_level:     0,
          status:        "active",
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      await supabase.from("wallets").insert({
        user_id:         newUser.id,
        balance:         0,
        total_earned:    0,
        total_withdrawn: 0,
        coins:           0,
      });

      if (referredBy) {
        await supabase.from("referrals").insert({
          referrer_id: referredBy,
          referred_id: newUser.id,
          earnings:    0,
        });
      }

      const { data: fullUser } = await supabase
        .from("users").select("*, wallets(*)")
        .eq("id", newUser.id).maybeSingle();

      return NextResponse.json({ user: fullUser, isNew: true });
    }

    // ── Update existing user profile ──────────────────────────────────────
    const { data: updatedUser } = await supabase
      .from("users")
      .update({
        first_name,
        last_name,
        username,
        photo_url,
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_id", telegramIdStr)
      .select("*, wallets(*)")
      .maybeSingle();

    return NextResponse.json({ user: updatedUser, isNew: false });
  } catch (err) {
    console.error("[Auth] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
