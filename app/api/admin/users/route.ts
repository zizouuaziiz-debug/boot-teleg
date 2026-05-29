import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

function unauthorized() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const from   = (page - 1) * limit;
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";

  // ⭐️ إضافة referrals count
  let query = supabase
    .from("users")
    .select("*, wallets(balance, total_earned, total_withdrawn), referrals!referrer_id(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,username.ilike.%${search}%,telegram_id.ilike.%${search}%`);
  }
  if (status) query = query.eq("status", status);

  const { data: users, count } = await query;

  // ⭐️ تحويل البيانات لتشمل عدد الإحالات
  const usersWithReferralCount = users?.map((user: any) => ({
    ...user,
    referral_count: user.referrals?.[0]?.count ?? 0,
  })) ?? [];

  return NextResponse.json({ users: usersWithReferralCount, total: count ?? 0, page, limit });
}

// ... باقي الكود (PATCH) يبقى كما هو
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { userId, action, balance, amount } = body as {
    userId?: string; action?: string; balance?: number; amount?: number;
  };

  if (!userId || !action) return NextResponse.json({ error: "userId and action required" }, { status: 400 });

  const { data: user } = await supabase.from("users")
    .select("id, status, wallets(balance, total_earned, total_withdrawn, coins)")
    .eq("id", userId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const walletRaw = user.wallets;
  const wallet = Array.isArray(walletRaw) ? walletRaw[0] : walletRaw as {
    balance: number; total_earned: number; total_withdrawn: number; coins: number;
  } | null;

  switch (action) {
    case "suspend":
      await supabase.from("users").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", userId);
      return NextResponse.json({ success: true, status: "suspended" });

    case "activate":
      await supabase.from("users").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", userId);
      return NextResponse.json({ success: true, status: "active" });

    case "ban":
      await supabase.from("users").update({ status: "banned", updated_at: new Date().toISOString() }).eq("id", userId);
      return NextResponse.json({ success: true, status: "banned" });

    case "updateBalance": {
      if (balance === undefined || isNaN(Number(balance)))
        return NextResponse.json({ error: "balance required" }, { status: 400 });
      const newWallet = {
        balance:         Number(balance),
        total_earned:    Number(wallet?.total_earned    ?? 0),
        total_withdrawn: Number(wallet?.total_withdrawn ?? 0),
        coins:           Number(wallet?.coins           ?? 0),
        updated_at:      new Date().toISOString(),
      };
      await supabase.from("wallets").update(newWallet).eq("user_id", userId);
      await broadcastWalletUpdate(userId, newWallet);
      return NextResponse.json({ success: true, newBalance: Number(balance) });
    }

    case "addBalance": {
      if (amount === undefined || isNaN(Number(amount)))
        return NextResponse.json({ error: "amount required" }, { status: 400 });
      const newWallet = {
        balance:         Number(wallet?.balance ?? 0)         + Number(amount),
        total_earned:    Number(wallet?.total_earned ?? 0)    + Number(amount),
        total_withdrawn: Number(wallet?.total_withdrawn ?? 0),
        coins:           Number(wallet?.coins ?? 0),
        updated_at:      new Date().toISOString(),
      };
      await supabase.from("wallets").update(newWallet).eq("user_id", userId);
      await broadcastWalletUpdate(userId, newWallet);
      await supabase.from("transactions").insert({
        user_id: userId, type: "admin_credit", amount: Number(amount), status: "approved",
      });
      return NextResponse.json({ success: true, newBalance: newWallet.balance });
    }

    case "delete": {
      for (const table of ["transactions","user_spin_state","user_daily_bonus","mining_sessions","video_watches","user_tasks"]) {
        await supabase.from(table as "transactions").delete().eq("user_id", userId);
      }
      await supabase.from("referrals").delete().or(`referrer_id.eq.${userId},referred_id.eq.${userId}`);
      await supabase.from("wallets").delete().eq("user_id", userId);
      await supabase.from("users").delete().eq("id", userId);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
