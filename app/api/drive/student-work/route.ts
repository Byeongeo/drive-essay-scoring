import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { writeJsonChild } from "@/lib/drive";
import type { GradingRecord, GradingSnapshot, OcrConfirmed, OcrDraft } from "@/lib/types";

export const runtime = "nodejs";

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
      ocrDraft?: OcrDraft;
      ocrConfirmed?: OcrConfirmed;
      aiGrading?: GradingSnapshot;
      finalGrading?: GradingRecord["finalGrading"];
    };

    if (!body.studentFolderId) {
      return NextResponse.json(
        { error: "studentFolderId가 필요합니다." },
        { status: 400 },
      );
    }

    const writes: Array<Promise<unknown>> = [];
    if (body.ocrDraft) {
      writes.push(writeJsonChild(accessToken, body.studentFolderId, "ocr-draft.json", body.ocrDraft));
    }
    if (body.ocrConfirmed) {
      writes.push(writeJsonChild(accessToken, body.studentFolderId, "ocr-confirmed.json", body.ocrConfirmed));
    }
    if (body.aiGrading) {
      writes.push(writeJsonChild(accessToken, body.studentFolderId, "ai-grading.json", body.aiGrading));
    }
    if (body.finalGrading) {
      writes.push(writeJsonChild(accessToken, body.studentFolderId, "final-grading.json", body.finalGrading));
    }

    await Promise.all(writes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "학생 결과 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
