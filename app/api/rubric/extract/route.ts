import { NextResponse } from "next/server";
import { extractRubricFromPrompt } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { systemPrompt } = await req.json();
    if (!systemPrompt) {
      return NextResponse.json(
        { error: "systemPrompt가 필요합니다." },
        { status: 400 },
      );
    }

    const rubric = await extractRubricFromPrompt(systemPrompt);
    return NextResponse.json(rubric);
  } catch (err) {
    const message = err instanceof Error ? err.message : "루브릭 추출 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
