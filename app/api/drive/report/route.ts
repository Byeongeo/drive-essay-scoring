import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { listClassIndexesInDrive, readStudentGradingSummary } from "@/lib/drive";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    const assessmentFolderId = url.searchParams.get("assessmentFolderId");
    if (!assessmentFolderId) {
      return NextResponse.json(
        { error: "assessmentFolderId가 필요합니다." },
        { status: 400 },
      );
    }

    const classIndexes = await listClassIndexesInDrive(accessToken, assessmentFolderId);
    const enriched = await Promise.all(
      classIndexes.map(async (classIndex) => ({
        ...classIndex,
        students: await Promise.all(
          classIndex.students.map(async (student) => {
            const grading = await readStudentGradingSummary(accessToken, student.folderId);
            const finalScore = grading.finalGrading?.totalScore;
            return {
              ...student,
              status: grading.finalGrading ? "final-saved" : student.status,
              totalScore: finalScore ?? student.totalScore,
              aiGrading: grading.aiGrading,
              finalGrading: grading.finalGrading,
            };
          }),
        ),
      })),
    );

    return NextResponse.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "리포트 불러오기 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
