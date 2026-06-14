import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { downloadFile } from "@/lib/drive";

export const runtime = "nodejs";

async function getAccessToken() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error("Google Drive 연결이 필요합니다.");
  }
  return session.accessToken;
}

export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  try {
    const accessToken = await getAccessToken();
    const file = await downloadFile(accessToken, params.fileId);
    const body = new Uint8Array(file.bytes).buffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "파일 불러오기 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
