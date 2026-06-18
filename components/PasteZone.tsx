"use client";

import { useState, type ClipboardEvent } from "react";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function isAllowed(type: string) {
  return type.startsWith("image/") || type === "application/pdf";
}

/**
 * 붙여넣기 이벤트에서 이미지/PDF 파일을 추출한다.
 * - 탐색기에서 복사한 파일(이미지/PDF)은 clipboardData.files 로 들어온다.
 * - 캡처(프린트스크린) 이미지는 clipboardData.items 의 file 항목으로 들어온다.
 * 캡처 이미지는 이름이 없거나 'image.png' 로 겹치므로 시간 기반 이름을 새로 부여한다.
 */
export function filesFromClipboard(e: ClipboardEvent): File[] {
  const dt = e.clipboardData;
  const out: File[] = [];
  if (dt.files && dt.files.length) {
    for (const f of Array.from(dt.files)) {
      if (isAllowed(f.type)) out.push(f);
    }
  }
  if (out.length === 0 && dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file" && isAllowed(item.type)) {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out.map((f) => {
    if (f.name && f.name !== "image.png") return f;
    const ext = EXT[f.type] ?? "png";
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new File([f], `붙여넣기-${stamp}.${ext}`, { type: f.type });
  });
}

/**
 * 클릭해 포커스를 준 뒤 Ctrl+V 로 캡처/이미지/PDF 를 붙여넣는 영역.
 * 추출한 파일을 onFiles 로 넘긴다(상위에서 기존 업로드 경로로 처리).
 */
export default function PasteZone({
  onFiles,
  disabled,
  label,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      tabIndex={disabled ? -1 : 0}
      role="button"
      onPaste={(e) => {
        if (disabled) return;
        const files = filesFromClipboard(e);
        if (files.length) {
          e.preventDefault();
          onFiles(files);
        }
      }}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      className={`mt-2 cursor-text rounded-md border-2 border-dashed px-3 py-3 text-center text-xs outline-none transition ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-300 text-slate-500 hover:border-slate-400"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      {active
        ? "이제 Ctrl+V 로 붙여넣으세요"
        : label ?? "또는 여기를 클릭한 뒤 Ctrl+V — 캡처(프린트스크린)·이미지·PDF 붙여넣기"}
    </div>
  );
}
