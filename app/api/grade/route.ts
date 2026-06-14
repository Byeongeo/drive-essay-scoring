import { NextResponse } from "next/server";
import { gradeStudentAnswer } from "@/lib/gemini";
import type { GradeInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<GradeInput>;
    if (!body.rubric || !body.confirmedAnswerText) {
      return NextResponse.json(
        { error: "rubric과 confirmedAnswerText가 필요합니다." },
        { status: 400 },
      );
    }

    const result = await gradeStudentAnswer({
      rubric: body.rubric,
      examples: body.examples ?? [],
      systemPrompt: body.systemPrompt ?? "",
        confirmedAnswerText: body.confirmedAnswerText,
        visualElements: body.visualElements ?? [],
        answerImages: body.answerImages ?? [],
        gradingMode: body.gradingMode,
        model: body.model,
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "채점 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
