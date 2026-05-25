import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createSessionToken, getAdminPasswordHash, COOKIE_NAME } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (!password) return NextResponse.json({ error: "Password required" }, { status: 400 });

    const storedHash = await getAdminPasswordHash();
    const inputHash  = hashPassword(password);

    const { timingSafeEqual } = await import("crypto");
    const match = timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
    if (!match) return NextResponse.json({ error: "Invalid password" }, { status: 401 });

    const token = createSessionToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("Admin login error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
