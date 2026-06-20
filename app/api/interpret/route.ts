import { NextResponse } from "next/server";
import { interpretStudentAnswer } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { pages, crossCheck } = await req.json();
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { error: "pages 배열이 필요합니다." },
        { status: 400 },
      );
    }

    const result = await interpretStudentAnswer(pages, { crossCheck: Boolean(crossCheck) });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "답안 해석 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
