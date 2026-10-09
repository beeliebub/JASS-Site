import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (pathname.startsWith("/admin") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname === "/login" && isLoggedIn && req.nextUrl.searchParams.get("reauth") !== "1") {
    const nextValues = req.nextUrl.searchParams.getAll("next");
    const destination = safeNextPath(nextValues.length === 1 ? nextValues[0] : undefined);
    return NextResponse.redirect(new URL(destination, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
