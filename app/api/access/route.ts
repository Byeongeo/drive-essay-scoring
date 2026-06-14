import { NextResponse } from "next/server";
import {
  accessCookieName,
  createAccessToken,
  isAccessPasswordEnabled,
  isAccessPasswordValid,
} from "@/lib/access";

export async function POST(req: Request) {
  if (!isAccessPasswordEnabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = body.password ?? "";
  if (!(await isAccessPasswordValid(password))) {
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(accessCookieName, await createAccessToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(accessCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
