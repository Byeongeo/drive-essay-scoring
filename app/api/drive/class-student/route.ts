import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  createDriveFolder,
  readJsonChild,
  updateJsonFile,
  uploadDataUrlFile,
  uploadJsonFile,
} from "@/lib/drive";
import { formatStudentFolderName } from "@/lib/student-grouping";
import type { ClassIndex, HeaderExtraction, StudentIndexItem } from "@/lib/types";

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
      classFolderId?: string;
      studentsFolderId?: string;
      header?: HeaderExtraction;
      pages?: Array<{ name: string; dataUrl: string }>;
    };

    if (!body.classFolderId || !body.studentsFolderId || !body.header || !body.pages?.length) {
      return NextResponse.json(
        { error: "classFolderId, studentsFolderId, header, pages가 필요합니다." },
        { status: 400 },
      );
    }

    const studentFolder = await createDriveFolder(
      accessToken,
      formatStudentFolderName(body.header),
      body.studentsFolderId,
    );
    const pagesFolder = await createDriveFolder(accessToken, "pages", studentFolder.id);

    const pageRefs = [];
    for (const page of body.pages) {
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
        header: body.header,
        status: "classified",
        updatedAt: Date.now(),
      },
      studentFolder.id,
    );

    const student: StudentIndexItem = {
      id: crypto.randomUUID(),
      grade: body.header.grade ?? 0,
      classNo: body.header.classNo ?? 0,
      studentNo: body.header.studentNo ?? 0,
      name: body.header.name ?? "",
      folderId: studentFolder.id,
      pageRefs,
      status: "classified",
      updatedAt: Date.now(),
    };

    const classJson = await readJsonChild<ClassIndex>(
      accessToken,
      body.classFolderId,
      "class-index.json",
    );
    if (classJson) {
      const nextClassIndex: ClassIndex = {
        ...classJson.data,
        students: [
          ...classJson.data.students.filter((item) => item.folderId !== student.folderId),
          student,
        ],
        updatedAt: Date.now(),
      };
      await updateJsonFile(accessToken, classJson.file.id, nextClassIndex);
      return NextResponse.json({ student, classIndex: nextClassIndex });
    }

    return NextResponse.json({ student });
  } catch (err) {
    const message = err instanceof Error ? err.message : "학생 답안 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
