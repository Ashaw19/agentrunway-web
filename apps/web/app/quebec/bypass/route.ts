import { NextRequest, NextResponse } from "next/server";

/**
 * Quebec Bypass Route
 *
 * Sets a cookie that disables the Quebec geo-block for 30 days.
 * For users who are VPN'd through Quebec, visiting from Quebec temporarily,
 * or otherwise not actually a Quebec-based agent.
 */
export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/";

  const response = NextResponse.redirect(url);
  response.cookies.set("qc-bypass", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
