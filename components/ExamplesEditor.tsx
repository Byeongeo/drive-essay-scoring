"use client";

import { useState } from "react";
import type { DriveRef, ScoringExample } from "@/lib/types";

function readFileAsDataUrl(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        dataUrl: String(reader.result),
      });
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

export default function ExamplesEditor({
  examples,
  onChange,
  onUploadAttachments,
}: {
  examples: ScoringExample[];
  onChange: (examples: ScoringExample[]) => void;
  onUploadAttachments?: (
    exampleId: string,
    files: Array<{ name: string; dataUrl: string }>,
  ) => Promise<DriveRef[]>;
}) {
  const [uploadingExampleId, setUploadingExampleId] = useState<string | null>(null);

  function addExample() {
    onChange([
      ...examples,
      {
        id: crypto.randomUUID(),
        score: 0,
        text: "",
        reason: "",
        attachments: [],
      },
    ]);
  }

  async function uploadFiles(example: ScoringExample, index: number, files: FileList | null) {
    if (!files?.length || !onUploadAttachments) return;
    setUploadingExampleId(example.id);
    try {
      const payload = await Promise.all(Array.from(files).map(readFileAsDataUrl));
      const uploaded = await onUploadAttachments(example.id, payload);
      const next = [...examples];
      next[index] = {
        ...example,
        attachments: [...example.attachments, ...uploaded],
      };
      onChange(next);
    } finally {
      setUploadingExampleId(null);
    }
  }

  return (
    <div className="space-y-4">
      {examples.length === 0 && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          예시답안은 선택사항입니다. 필요한 경우 텍스트와 함께 이미지, PDF, 수식 자료를 첨부할 수 있습니다.
        </p>
      )}

      {examples.map((example, index) => (
        <div key={example.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              type="number"
              value={example.score}
              onChange={(event) => {
                const next = [...examples];
                next[index] = { ...example, score: Number(event.target.value) };
                onChange(next);
              }}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="text-sm text-slate-500">점 예시답안</span>
            <button
              type="button"
              onClick={() => onChange(examples.filter((_, i) => i !== index))}
              className="ml-auto rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">예시답안 텍스트</span>
            <textarea
              value={example.text}
              onChange={(event) => {
                const next = [...examples];
                next[index] = { ...example, text: event.target.value };
                onChange(next);
              }}
              rows={6}
              className="mt-1 min-h-40 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
            />
          </label>

          <div className="mt-3">
            <span className="text-sm font-medium text-slate-700">예시답안 첨부</span>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(event) => void uploadFiles(example, index, event.target.files)}
              disabled={!onUploadAttachments || uploadingExampleId === example.id}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
            />
            {!onUploadAttachments && (
              <p className="mt-1 text-xs text-slate-500">
                첨부 파일은 평가를 Drive에 저장한 뒤 추가할 수 있습니다.
              </p>
            )}
            {example.attachments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {example.attachments.map((attachment) => (
                  <li
                    key={attachment.fileId}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  >
                    <span className="truncate">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...examples];
                        next[index] = {
                          ...example,
                          attachments: example.attachments.filter(
                            (item) => item.fileId !== attachment.fileId,
                          ),
                        };
                        onChange(next);
                      }}
                      className="ml-3 shrink-0 text-xs font-medium text-red-600"
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="mt-3 block">
            <span className="text-sm font-medium text-slate-700">점수를 준 이유</span>
            <textarea
              value={example.reason}
              onChange={(event) => {
                const next = [...examples];
                next[index] = { ...example, reason: event.target.value };
                onChange(next);
              }}
              rows={5}
              className="mt-1 min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={addExample}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        예시답안 추가
      </button>
    </div>
  );
}
