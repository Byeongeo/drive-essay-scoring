import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { ensureAppRoot } from "@/lib/drive";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Google Drive 연결이 필요합니다." },
        { status: 401 },
      );
    }

    const result = await ensureAppRoot(session.accessToken);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drive 폴더 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
