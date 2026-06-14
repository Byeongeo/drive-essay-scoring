"use client";

import type { Rubric, RubricCriterion } from "@/lib/types";

function emptyCriterion(): RubricCriterion {
  return {
    name: "",
    levels: [
      { label: "상", score: 3, descriptor: "" },
      { label: "중", score: 2, descriptor: "" },
      { label: "하", score: 1, descriptor: "" },
    ],
  };
}

export default function RubricBuilder({
  rubric,
  onChange,
}: {
  rubric: Rubric;
  onChange: (rubric: Rubric) => void;
}) {
  const criteria = rubric.criteria;

  function update(next: RubricCriterion[]) {
    onChange({ criteria: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">채점 기준 {criteria.length}개</span>
        <button
          type="button"
          onClick={() => update([...criteria, emptyCriterion()])}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          기준 추가
        </button>
      </div>

      {criteria.length === 0 && (
        <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
          직접 루브릭을 넣지 않아도 됩니다. 문제지나 채점기준표 파일을 첨부하면 AI가 그 자료를 참고해 채점합니다.
        </p>
      )}

      {criteria.map((criterion, criterionIndex) => (
        <div key={criterionIndex} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex gap-2">
            <input
              value={criterion.name}
              onChange={(event) => {
                const next = [...criteria];
                next[criterionIndex] = { ...criterion, name: event.target.value };
                update(next);
              }}
              placeholder="채점 요소 이름"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => update(criteria.filter((_, index) => index !== criterionIndex))}
              className="rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {criterion.levels.map((level, levelIndex) => (
              <div key={levelIndex} className="grid gap-2 sm:grid-cols-[100px_90px_1fr_56px]">
                <input
                  value={level.label}
                  onChange={(event) => {
                    const levels = [...criterion.levels];
                    levels[levelIndex] = { ...level, label: event.target.value };
                    const next = [...criteria];
                    next[criterionIndex] = { ...criterion, levels };
                    update(next);
                  }}
                  placeholder="수준"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={level.score}
                  onChange={(event) => {
                    const levels = [...criterion.levels];
                    levels[levelIndex] = { ...level, score: Number(event.target.value) };
                    const next = [...criteria];
                    next[criterionIndex] = { ...criterion, levels };
                    update(next);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <textarea
                  value={level.descriptor}
                  onChange={(event) => {
                    const levels = [...criterion.levels];
                    levels[levelIndex] = { ...level, descriptor: event.target.value };
                    const next = [...criteria];
                    next[criterionIndex] = { ...criterion, levels };
                    update(next);
                  }}
                  rows={2}
                  placeholder="해당 수준의 채점 기준"
                  className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
                />
                <button
                  type="button"
                  onClick={() => {
                    const levels = criterion.levels.filter((_, index) => index !== levelIndex);
                    const next = [...criteria];
                    next[criterionIndex] = { ...criterion, levels };
                    update(next);
                  }}
                  className="rounded-md text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const next = [...criteria];
              next[criterionIndex] = {
                ...criterion,
                levels: [...criterion.levels, { label: "", score: 0, descriptor: "" }],
              };
              update(next);
            }}
            className="mt-3 text-sm font-medium text-brand-700 hover:text-brand-600"
          >
            점수 구간 추가
          </button>
        </div>
      ))}
    </div>
  );
}
