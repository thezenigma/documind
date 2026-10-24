import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);

/**
 * Optimistic gate for signed-in routes: verifies the cookie signature only,
 * then lets pages do the authoritative session-row check in the data access
 * layer. Next.js 16 renamed middleware to proxy.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get("documind_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/signin", request.url));

  return jwtVerify(token, secret, { algorithms: ["HS256"] })
    .then(() => NextResponse.next())
    .catch(() => {
      const response = NextResponse.redirect(new URL("/signin", request.url));
      response.cookies.delete("documind_session");
      return response;
    });
}

export const config = {
  matcher: ["/library/:path*", "/ask/:path*", "/account/:path*", "/admin/:path*"],
};
