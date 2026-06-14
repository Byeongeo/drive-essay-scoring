import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  listClassIndexesInDrive,
  readJsonChild,
  trashDriveFile,
  updateJsonFile,
  writeJsonChild,
} from "@/lib/drive";
import type {
  ClassIndex,
  GradingRecord,
  GradingSnapshot,
  OcrConfirmed,
  OcrDraft,
} from "@/lib/types";

export const runtime = "nodejs";

async function getAccessToken() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error("Google Drive 연결이 필요합니다.");
  }
  return session.accessToken;
}

export async function GET(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const url = new URL(req.url);
    const studentFolderId = url.searchParams.get("studentFolderId");
    if (!studentFolderId) {
      return NextResponse.json({ error: "studentFolderId가 필요합니다." }, { status: 400 });
    }

    const [ocrDraft, ocrConfirmed, aiGrading, finalGrading] = await Promise.all([
      readJsonChild<OcrDraft>(accessToken, studentFolderId, "ocr-draft.json"),
      readJsonChild<OcrConfirmed>(accessToken, studentFolderId, "ocr-confirmed.json"),
      readJsonChild<GradingSnapshot>(accessToken, studentFolderId, "ai-grading.json"),
      readJsonChild<GradingRecord["finalGrading"]>(
        accessToken,
        studentFolderId,
        "final-grading.json",
      ),
    ]);

    return NextResponse.json({
      ocrDraft: ocrDraft?.data ?? null,
      ocrConfirmed: ocrConfirmed?.data ?? null,
      aiGrading: aiGrading?.data ?? null,
      finalGrading: finalGrading?.data ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "학생 결과 불러오기 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
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
      return NextResponse.json({ error: "studentFolderId가 필요합니다." }, { status: 400 });
    }

    const writes: Array<Promise<unknown>> = [];
    if (body.ocrDraft) {
      writes.push(writeJsonChild(accessToken, body.studentFolderId, "ocr-draft.json", body.ocrDraft));
    }
    if (body.ocrConfirmed) {
      writes.push(
        writeJsonChild(accessToken, body.studentFolderId, "ocr-confirmed.json", body.ocrConfirmed),
      );
    }
    if (body.aiGrading) {
      writes.push(writeJsonChild(accessToken, body.studentFolderId, "ai-grading.json", body.aiGrading));
    }
    if (body.finalGrading) {
      writes.push(
        writeJsonChild(accessToken, body.studentFolderId, "final-grading.json", body.finalGrading),
      );
    }

    await Promise.all(writes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "학생 결과 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const body = (await req.json()) as {
      assessmentFolderId?: string;
      studentFolderId?: string;
    };
    if (!body.assessmentFolderId || !body.studentFolderId) {
      return NextResponse.json(
        { error: "assessmentFolderId와 studentFolderId가 필요합니다." },
        { status: 400 },
      );
    }

    const classIndexes = await listClassIndexesInDrive(accessToken, body.assessmentFolderId);
    let updatedClass: ClassIndex | null = null;
    for (const classIndex of classIndexes) {
      const hasStudent = classIndex.students.some(
        (student) => student.folderId === body.studentFolderId,
      );
      if (!hasStudent || !classIndex.folderId) continue;

      const classJson = await readJsonChild<ClassIndex>(
        accessToken,
        classIndex.folderId,
        "class-index.json",
      );
      if (!classJson) continue;

      updatedClass = {
        ...classJson.data,
        students: classJson.data.students.filter(
          (student) => student.folderId !== body.studentFolderId,
        ),
        updatedAt: Date.now(),
      };
      await updateJsonFile(accessToken, classJson.file.id, updatedClass);
      break;
    }

    await trashDriveFile(accessToken, body.studentFolderId);

    return NextResponse.json({ ok: true, classIndex: updatedClass });
  } catch (err) {
    const message = err instanceof Error ? err.message : "학생 삭제 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
