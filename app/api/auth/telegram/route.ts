import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateReferralCode, validateTelegramWebAppData } from "@/lib/telegram-auth";
import { createReferral } from "@/lib/createReferral";

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

    // ── Validate Telegram init data ────────────────────────────────────────
    if (botToken && init_data) {
      try {
        const validatedUser = validateTelegramWebAppData(init_data, botToken);
        if (validatedUser?.id && String(validatedUser.id) !== telegramIdStr) {
          console.warn("[Auth] Telegram ID mismatch");
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
      console.error("[Auth] Database error:", error);
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
      
      // التحقق من كود الإحالة
      if (refCode) {
        console.log("[Auth] Looking up referral code:", refCode);
        
        const { data: referrer, error: refError } = await supabase
          .from("users")
          .select("id, referral_code")
          .eq("referral_code", refCode)
          .maybeSingle();

        if (refError) {
          console.error("[Auth] Error looking up referrer:", refError);
        }

        if (referrer) {
          // منع المستخدم من إحالة نفسه
          if (String(referrer.id) !== telegramIdStr) {
            referredBy = referrer.id;
            console.log("[Auth] Referrer found:", referrer.id);
          } else {
            console.warn("[Auth] User tried to refer themselves");
          }
        } else {
          console.warn("[Auth] Invalid referral code:", refCode);
        }
      }

      // إنشاء المستخدم الجديد
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          telegram_id: telegramIdStr,
          first_name,
          last_name,
          username,
          photo_url,
          referral_code: newReferralCode,
          referred_by: referredBy,
          vip_level: 0,
          status: "active",
        })
        .select()
        .single();

      if (createError) {
        console.error("[Auth] Error creating user:", createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      // إنشاء المحفظة
      const { error: walletError } = await supabase
        .from("wallets")
        .insert({
          user_id: newUser.id,
          balance: 0,
          total_earned: 0,
          total_withdrawn: 0,
          coins: 0,
        });

      if (walletError) {
        console.error("[Auth] Error creating wallet:", walletError);
      }

      // إنشاء الإحالة باستخدام الدالة الجديدة
      if (referredBy) {
        const referralResult = await createReferral(referredBy, newUser.id);
        
        if (referralResult.success) {
          console.log("[Auth] Referral created successfully:", {
            referrer: referredBy,
            referred: newUser.id,
          });
        } else {
          console.error("[Auth] Failed to create referral:", referralResult.error);
          
          // محاولة احتياطية - إنشاء الإحالة مباشرة
          const { error: directError } = await supabase
            .from("referrals")
            .insert({
              referrer_id: referredBy,
              referred_id: newUser.id,
              earnings: 0,
              created_at: new Date().toISOString(),
            });
            
          if (directError) {
            console.error("[Auth] Direct referral creation also failed:", directError);
          }
        }
      }

      // جلب بيانات المستخدم كاملة مع المحفظة
      const { data: fullUser } = await supabase
        .from("users")
        .select("*, wallets(*)")
        .eq("id", newUser.id)
        .maybeSingle();

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
    console.error("[Auth] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
