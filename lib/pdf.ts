"use client";

export interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export async function renderPdfToImages(
  file: File,
  opts: { scale?: number; quality?: number } = {},
): Promise<RenderedPage[]> {
  const scale = opts.scale ?? 2;
  const quality = opts.quality ?? 0.85;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
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
