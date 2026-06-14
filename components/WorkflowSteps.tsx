const steps = [
  "Google Drive 연결",
  "과목/회차 생성",
  "루브릭 또는 시스템 프롬프트 입력",
  "반별 PDF 업로드",
  "학생 자동 분류 확인",
  "OCR/수식/도형 해석 확인",
  "AI 채점 결과 전체 가져오기",
  "교사 수정 후 최종 저장",
];

export default function WorkflowSteps() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">채점 흐름</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {index + 1}
            </span>
            <span className="text-sm text-slate-700">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
