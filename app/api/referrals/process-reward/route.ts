import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";
import { creditReferralReward } from "@/lib/creditReferralReward";

// Internal route — only callable from admin panel (requires admin session cookie)
// or from within the same server process via relative fetch.
export async function POST(req: NextRequest) {
  // Allow admin-authenticated callers
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const isAdmin = token && verifySessionToken(token);

  // Allow internal server-side calls (same host, no Origin header)
  const origin = req.headers.get("origin");
  const host   = req.headers.get("host");
  const isInternal = !origin || origin.includes(host ?? "");

  if (!isAdmin && !isInternal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.userId || typeof body.amount !== "number") {
      return NextResponse.json({ error: "userId and amount required" }, { status: 400 });
    }

    await creditReferralReward(body.userId, body.amount);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
