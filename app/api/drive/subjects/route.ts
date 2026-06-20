import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { createSubjectInDrive, deleteSubjectInDrive, ensureAppRoot } from "@/lib/drive";

export const runtime = "nodejs";
export const maxDuration = 300; // 삭제는 하위 파일을 하나씩 휴지통에 보내므로 길어질 수 있다.

async function getAccessToken() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error("Google Drive 연결이 필요합니다.");
  }
  return session.accessToken;
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const appRoot = await ensureAppRoot(accessToken);
    return NextResponse.json(appRoot.index.subjects);
  } catch (err) {
    const message = err instanceof Error ? err.message : "과목 목록 불러오기 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const { name } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "과목 이름이 필요합니다." }, { status: 400 });
    }

    const result = await createSubjectInDrive(accessToken, name.trim());
    return NextResponse.json({
      id: result.subject.id,
      name: result.subject.name,
      folderId: result.subject.folderId,
      createdAt: result.subject.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "과목 생성 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const subjectId = new URL(req.url).searchParams.get("subjectId");
    if (!subjectId) {
      return NextResponse.json({ error: "subjectId가 필요합니다." }, { status: 400 });
    }
    await deleteSubjectInDrive(accessToken, subjectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "과목 삭제 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
