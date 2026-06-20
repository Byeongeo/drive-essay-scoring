import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  deleteAssessmentInDrive,
  ensureAppRoot,
  listAssessmentsInDrive,
  readAssessmentBundle,
  saveAssessmentInDrive,
  updateAssessmentBundle,
} from "@/lib/drive";
import type { Assessment, Rubric, ScoringExample } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 삭제는 하위 파일을 하나씩 휴지통에 보내므로 길어질 수 있다.

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
    const subjectId = url.searchParams.get("subjectId");
    const folderId = url.searchParams.get("folderId");

    if (folderId) {
      const bundle = await readAssessmentBundle(accessToken, folderId);
      return NextResponse.json(bundle);
    }

    if (!subjectId) {
      return NextResponse.json({ error: "subjectId가 필요합니다." }, { status: 400 });
    }

    const assessments = await listAssessmentsInDrive(accessToken, subjectId);
    return NextResponse.json(assessments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "회차 불러오기 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const body = (await req.json()) as {
      subjectId?: string;
      assessment?: Omit<Assessment, "folderId" | "createdAt"> & { createdAt?: number };
      rubric?: Rubric;
      examples?: ScoringExample[];
    };

    if (!body.subjectId || !body.assessment) {
      return NextResponse.json(
        { error: "subjectId와 assessment가 필요합니다." },
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

    const result = await saveAssessmentInDrive(accessToken, {
      subject,
      assessment: body.assessment,
      rubric: body.rubric ?? { criteria: [] },
      examples: body.examples ?? [],
    });

    return NextResponse.json(result.assessment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "회차 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const body = (await req.json()) as {
      assessment?: Assessment;
      rubric?: Rubric;
      examples?: ScoringExample[];
    };

    if (!body.assessment?.folderId) {
      return NextResponse.json(
        { error: "assessment.folderId가 필요합니다." },
        { status: 400 },
      );
    }

    await updateAssessmentBundle(accessToken, body.assessment.folderId, {
      assessment: body.assessment,
      rubric: body.rubric ?? { criteria: [] },
      examples: body.examples ?? [],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "회차 수정 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");
    const assessmentId = searchParams.get("assessmentId");
    if (!subjectId || !assessmentId) {
      return NextResponse.json(
        { error: "subjectId와 assessmentId가 필요합니다." },
        { status: 400 },
      );
    }
    await deleteAssessmentInDrive(accessToken, subjectId, assessmentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "회차 삭제 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
