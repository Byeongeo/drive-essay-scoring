import { NextResponse, type NextRequest } from "next/server";
import { hasValidAccessCookie, isAccessPasswordEnabled } from "@/lib/access";

const publicPathPrefixes = ["/access", "/api/access", "/api/auth", "/_next"];

function isPublicPath(pathname: string) {
  return (
    pathname === "/favicon.ico" ||
    publicPathPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

export async function middleware(req: NextRequest) {
  if (!isAccessPasswordEnabled() || isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (await hasValidAccessCookie(req)) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "앱 접속 비밀번호 확인이 필요합니다." },
      { status: 401 },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/access";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
