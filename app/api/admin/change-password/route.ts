import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME, hashPassword, setAdminPasswordHash } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json();
  if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const hash   = hashPassword(password);
  const result = await setAdminPasswordHash(hash);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ success: true });
}
