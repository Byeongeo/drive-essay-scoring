"use client";

import type { ScoringExample } from "@/lib/types";

export default function ExamplesEditor({
  examples,
  onChange,
}: {
  examples: ScoringExample[];
  onChange: (examples: ScoringExample[]) => void;
}) {
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

  return (
    <div className="space-y-4">
      {examples.length === 0 && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          예시답안은 선택사항입니다. 수학/과학은 나중에 이미지와 수식 첨부를 함께 저장하도록 확장합니다.
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
            <span className="text-sm font-medium text-slate-700">예시답안</span>
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
