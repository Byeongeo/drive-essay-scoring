"use client";

import { useMemo, useState } from "react";

const initialScores = [
  {
    criterionName: "개념 이해",
    score: 3,
    reason: "핵심 개념을 대부분 정확히 설명했으나 일부 용어 사용이 불명확합니다.",
  },
  {
    criterionName: "논리적 설명",
    score: 4,
    reason: "답안의 흐름이 자연스럽고 근거와 결론이 잘 연결되어 있습니다.",
  },
];

export default function GradingEditorPreview() {
  const [scores, setScores] = useState(initialScores);
  const [feedback, setFeedback] = useState(
    "개념 설명과 풀이 과정이 전반적으로 잘 드러납니다. 다만 불명확한 표현은 교사가 원본 답안을 확인한 뒤 더 정확한 용어로 수정할 필요가 있습니다.",
  );

  const total = useMemo(
    () => scores.reduce((sum, score) => sum + Number(score.score || 0), 0),
    [scores],
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">채점 편집 화면 방향</h2>
          <p className="mt-1 text-sm text-slate-500">
            AI 피드백만이 아니라 점수, 근거, 피드백 전체를 가져와 교사가 크게 수정합니다.
          </p>
        </div>
        <div className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          총점 {total}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {scores.map((score, index) => (
          <div key={score.criterionName} className="rounded-md border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">채점 요소</span>
                <input
                  value={score.criterionName}
                  onChange={(event) => {
                    const next = [...scores];
                    next[index] = { ...score, criterionName: event.target.value };
                    setScores(next);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">점수</span>
                <input
                  type="number"
                  value={score.score}
                  onChange={(event) => {
                    const next = [...scores];
                    next[index] = { ...score, score: Number(event.target.value) };
                    setScores(next);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-sm font-medium text-slate-700">채점 근거</span>
              <textarea
                value={score.reason}
                onChange={(event) => {
                  const next = [...scores];
                  next[index] = { ...score, reason: event.target.value };
                  setScores(next);
                }}
                rows={5}
                className="mt-1 min-h-36 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
              />
            </label>
          </div>
        ))}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">최종 피드백</span>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={9}
            className="mt-1 min-h-64 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
          />
        </label>
      </div>
    </section>
  );
}
