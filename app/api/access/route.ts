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

  const body = (await req.json().catch(() => ({}))) as {
    password?: string;
    remember?: boolean;
  };
  const password = body.password ?? "";
  if (!(await isAccessPasswordValid(password))) {
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  // 기본은 세션 쿠키(maxAge 미설정 → 창을 닫으면 삭제). 다시 접속하면 패스코드를 재입력해야 하므로
  // 공용·학교 PC에서 안전하다. "이 컴퓨터 기억하기"를 체크한 경우에만 30일 동안 유지(개인 PC 편의).
  res.cookies.set(accessCookieName, await createAccessToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(body.remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
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
