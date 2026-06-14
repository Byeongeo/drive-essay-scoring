import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  createDriveFolder,
  ensureAppRoot,
  uploadJsonFile,
} from "@/lib/drive";
import type { ClassIndex } from "@/lib/types";

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
      subjectId?: string;
      assessmentFolderId?: string;
      assessmentTitle?: string;
      className?: string;
      grade?: number;
      classNo?: number;
    };

    if (!body.subjectId || !body.assessmentTitle || !body.className) {
      return NextResponse.json(
        { error: "subjectId, assessmentTitle, className이 필요합니다." },
        { status: 400 },
      );
    }

    const appRoot = await ensureAppRoot(accessToken);
    const subject = appRoot.index.subjects.find((item) => item.id === body.subjectId);
    if (!subject) {
      return NextResponse.json(
        { error: "Drive에서 과목을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const assessmentFolder = body.assessmentFolderId
      ? {
          id: body.assessmentFolderId,
          name: body.assessmentTitle,
          mimeType: "application/vnd.google-apps.folder",
        }
      : await createDriveFolder(accessToken, body.assessmentTitle, subject.folderId);

    const classFolder = await createDriveFolder(accessToken, body.className, assessmentFolder.id);
    const studentsFolder = await createDriveFolder(accessToken, "students", classFolder.id);

    const classIndex: ClassIndex = {
      folderId: classFolder.id,
      name: body.className,
      grade: body.grade ?? 0,
      classNo: body.classNo ?? 0,
      students: [],
      updatedAt: Date.now(),
    };

    await uploadJsonFile(accessToken, "class-index.json", classIndex, classFolder.id);

    return NextResponse.json({ classFolder, studentsFolder, classIndex });
  } catch (err) {
    const message = err instanceof Error ? err.message : "반 저장 준비 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
