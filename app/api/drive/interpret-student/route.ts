import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { downloadFile, writeJsonChild } from "@/lib/drive";
import { interpretStudentAnswer } from "@/lib/gemini";
import type { DriveRef } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function getAccessToken() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error("Google Drive 연결이 필요합니다.");
  }
  return session.accessToken;
}

export async function POST(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const body = (await req.json()) as {
      studentFolderId?: string;
      pageRefs?: DriveRef[];
      crossCheck?: boolean;
    };

    if (!body.studentFolderId || !body.pageRefs?.length) {
      return NextResponse.json(
        { error: "studentFolderId와 pageRefs가 필요합니다." },
        { status: 400 },
      );
    }

    const pages = await Promise.all(
      body.pageRefs.map(async (pageRef) => {
        const file = await downloadFile(accessToken, pageRef.fileId);
        return {
          base64: file.bytes.toString("base64"),
          mimeType: file.mimeType || pageRef.mimeType || "image/jpeg",
          fileId: pageRef.fileId,
          name: pageRef.name,
        };
      }),
    );

    const draft = await interpretStudentAnswer(pages, { crossCheck: body.crossCheck });
    await writeJsonChild(accessToken, body.studentFolderId, "ocr-draft.json", draft);

    return NextResponse.json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : "학생 답안 AI 해석 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
