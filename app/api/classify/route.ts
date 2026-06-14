import { NextResponse } from "next/server";
import { extractHeaderFromPage } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { pageImageBase64, mimeType } = await req.json();
    if (!pageImageBase64) {
      return NextResponse.json(
        { error: "pageImageBase64가 필요합니다." },
        { status: 400 },
      );
    }

    const result = await extractHeaderFromPage(pageImageBase64, mimeType);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "머리글 분석 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
