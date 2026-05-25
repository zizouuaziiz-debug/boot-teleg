import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastWalletUpdate } from "@/lib/realtime-broadcast";

export async function POST(req: NextRequest) {
  const supabase   = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { task_id } = body as { task_id?: string };
  if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  const { data: user } = await supabase.from("users").select("id, status")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.status === "banned" || user.status === "suspended")
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });

  const { data: task } = await supabase.from("tasks").select("*")
    .eq("id", task_id).eq("is_active", true).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const completedAt = new Date().toISOString();

  // ── Race-safe completion: try INSERT first ─────────────────────────────────
  // If the row doesn't exist yet, INSERT succeeds → reward is credited.
  // If the row already exists (completed or not), INSERT fails (unique constraint).
  const { data: insertedRow, error: insertErr } = await supabase
    .from("user_tasks")
    .insert({ user_id: user.id, task_id, completed: true, progress: 100, completed_at: completedAt })
    .select()
    .maybeSingle();

  if (insertErr && !insertErr.message.includes("duplicate") && !insertErr.code?.includes("23505")) {
    // Unexpected DB error
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (!insertedRow) {
    // Row existed — try to flip completed=false → true atomically.
    // Only succeeds once: concurrent requests get count=0 and are rejected.
    const { data: updatedRow } = await supabase
      .from("user_tasks")
      .update({ completed: true, progress: 100, completed_at: completedAt })
      .eq("user_id", user.id)
      .eq("task_id", task_id)
      .eq("completed", false)  // optimistic lock
      .select()
      .maybeSingle();

    if (!updatedRow) {
      return NextResponse.json({ error: "Task already completed" }, { status: 400 });
    }
  }

  // ── Credit wallet ──────────────────────────────────────────────────────────
  const { data: wallet } = await supabase.from("wallets")
    .select("balance, total_earned, total_withdrawn, coins").eq("user_id", user.id).maybeSingle();

  if (wallet) {
    const taskReward = Number(task.reward ?? 0);
    const newWallet  = {
      balance:         Number(wallet.balance)         + taskReward,
      total_earned:    Number(wallet.total_earned)    + taskReward,
      total_withdrawn: Number(wallet.total_withdrawn),
      coins:           Number(wallet.coins),
      updated_at:      completedAt,
    };
    await supabase.from("wallets").update(newWallet).eq("user_id", user.id);
    await broadcastWalletUpdate(user.id, newWallet);
  }

  await supabase.from("transactions").insert({
    user_id: user.id, type: "earning", amount: task.reward ?? 0,
    status: "completed", source: task.title ?? "Task",
  });

  return NextResponse.json({ success: true, reward: task.reward ?? 0 });
}
