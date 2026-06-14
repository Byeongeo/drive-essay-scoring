import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  createDriveFolder,
  ensureAppRoot,
  uploadDataUrlFile,
  uploadJsonFile,
} from "@/lib/drive";
import { formatStudentFolderName } from "@/lib/student-grouping";
import type { ClassIndex, HeaderExtraction } from "@/lib/types";

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
      subjectId?: string;
      assessmentFolderId?: string;
      assessmentTitle?: string;
      className?: string;
      groups?: Array<{
        header: HeaderExtraction;
        pages: Array<{ name: string; dataUrl: string }>;
      }>;
    };

    if (!body.subjectId || !body.assessmentTitle || !body.className || !body.groups?.length) {
      return NextResponse.json(
        { error: "subjectId, assessmentTitle, className, groups가 필요합니다." },
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
      ? { id: body.assessmentFolderId, name: body.assessmentTitle, mimeType: "application/vnd.google-apps.folder" }
      : await createDriveFolder(
          accessToken,
          body.assessmentTitle,
          subject.folderId,
        );
    const classFolder = await createDriveFolder(accessToken, body.className, assessmentFolder.id);
    const studentsFolder = await createDriveFolder(accessToken, "students", classFolder.id);

    const classIndex: ClassIndex = {
      folderId: classFolder.id,
      name: body.className,
      grade: body.groups[0].header.grade ?? 0,
      classNo: body.groups[0].header.classNo ?? 0,
      students: [],
      updatedAt: Date.now(),
    };

    for (const group of body.groups) {
      const studentFolder = await createDriveFolder(
        accessToken,
        formatStudentFolderName(group.header),
        studentsFolder.id,
      );
      const pagesFolder = await createDriveFolder(accessToken, "pages", studentFolder.id);

      const pageRefs = [];
      for (const page of group.pages) {
        const savedPage = await uploadDataUrlFile(accessToken, page.name, page.dataUrl, pagesFolder.id);
        pageRefs.push({
          fileId: savedPage.id,
          name: savedPage.name,
          mimeType: savedPage.mimeType,
        });
      }

      await uploadJsonFile(
        accessToken,
        "student.json",
        {
          header: group.header,
          status: "classified",
          updatedAt: Date.now(),
        },
        studentFolder.id,
      );

      classIndex.students.push({
        id: crypto.randomUUID(),
        grade: group.header.grade ?? 0,
        classNo: group.header.classNo ?? 0,
        studentNo: group.header.studentNo ?? 0,
        name: group.header.name ?? "",
        folderId: studentFolder.id,
        pageRefs,
        status: "classified",
        updatedAt: Date.now(),
      });
    }

    await uploadJsonFile(accessToken, "class-index.json", classIndex, classFolder.id);

    return NextResponse.json({ classFolder, classIndex });
  } catch (err) {
    const message = err instanceof Error ? err.message : "반별 답안 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
