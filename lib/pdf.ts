"use client";

export interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export async function renderPdfToImages(
  file: File,
  opts: { scale?: number; quality?: number; maxEdge?: number } = {},
): Promise<RenderedPage[]> {
  const baseScale = opts.scale ?? 2;
  const quality = opts.quality ?? 0.85;
  // 큰 스캔본(예: A4 고해상도)을 너무 큰 캔버스로 렌더하면 브라우저 렌더러가
  // 메모리 부족으로 탭이 죽는다. 페이지의 긴 변이 maxEdge(px)를 넘지 않도록
  // 스케일을 자동으로 낮춘다. OCR 정확도와 메모리 안정성의 절충값.
  const maxEdge = opts.maxEdge ?? 2200;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const natural = page.getViewport({ scale: 1 });
    const longestAtBase = Math.max(natural.width, natural.height) * baseScale;
    const scale =
      longestAtBase > maxEdge ? maxEdge / Math.max(natural.width, natural.height) : baseScale;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF 페이지를 이미지로 변환할 수 없습니다.");

    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL("image/jpeg", quality),
      width: canvas.width,
      height: canvas.height,
    });
    page.cleanup();
  }

  await doc.cleanup();
  return pages;
}

export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
