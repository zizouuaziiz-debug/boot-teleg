import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const telegramId = req.headers.get("x-telegram-id");
  if (!telegramId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("id")
    .eq("telegram_id", telegramId).maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: tasks } = await supabase
    .from("tasks").select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const { data: userTasks } = await supabase
    .from("user_tasks").select("*")
    .eq("user_id", user.id);

  const tasksWithStatus = (tasks ?? []).map((task) => {
    const userTask = (userTasks ?? []).find(
      (ut: { task_id: string }) => ut.task_id === task.id
    );
    return {
      ...task,
      completed: userTask?.completed ?? false,
      progress:  userTask?.progress  ?? 0,
    };
  });

  return NextResponse.json({ tasks: tasksWithStatus });
}
