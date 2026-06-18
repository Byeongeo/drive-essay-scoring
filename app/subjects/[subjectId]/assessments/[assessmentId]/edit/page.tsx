"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ExamplesEditor from "@/components/ExamplesEditor";
import PasteZone from "@/components/PasteZone";
import RubricBuilder from "@/components/RubricBuilder";
import {
  extractRubric,
  readDriveAssessmentBundle,
  saveDriveAssessment,
  updateDriveAssessment,
  uploadAssessmentFiles,
} from "@/lib/api";
import { loadStore, saveStore, type DraftAssessment } from "@/lib/client-store";
import type { DriveRef, Rubric, ScoringExample } from "@/lib/types";

function toDateInput(value: number): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInput(value: string): number {
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

function readFileAsDataUrl(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

export default function AssessmentEditPage({
  params,
}: {
  params: { subjectId: string; assessmentId: string };
}) {
  const [assessment, setAssessment] = useState<DraftAssessment | null>(null);
  const [rubric, setRubric] = useState<Rubric>({ criteria: [] });
  const [examples, setExamples] = useState<ScoringExample[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploadingSource, setUploadingSource] = useState(false);

  useEffect(() => {
    let active = true;
    const store = loadStore();
    const localAssessment =
      store.assessments.find((item) => item.id === params.assessmentId) ?? null;
    setAssessment(localAssessment);
    setRubric(store.rubrics[params.assessmentId] ?? { criteria: [] });
    setExamples(store.examples[params.assessmentId] ?? []);
    async function loadDriveBundle() {
      if (!localAssessment?.folderId) return;
      try {
        const bundle = await readDriveAssessmentBundle(localAssessment.folderId);
        if (!active) return;
        if (bundle.assessment) {
          setAssessment({
            ...bundle.assessment,
            subjectId: params.subjectId,
          });
        }
        setRubric(bundle.rubric);
        setExamples(bundle.examples);
      } catch {
        // Keep local draft available.
      }
    }
    void loadDriveBundle();
    return () => {
      active = false;
    };
  }, [params.assessmentId, params.subjectId]);

  function patchAssessment(patch: Partial<DraftAssessment>) {
    if (!assessment) return;
    setAssessment({ ...assessment, ...patch });
  }

  function saveLocalDraft(nextAssessment: DraftAssessment, nextExamples = examples) {
    const store = loadStore();
    saveStore({
      ...store,
      assessments: store.assessments.map((item) =>
        item.id === nextAssessment.id ? nextAssessment : item,
      ),
      rubrics: { ...store.rubrics, [nextAssessment.id]: rubric },
      examples: { ...store.examples, [nextAssessment.id]: nextExamples },
    });
  }

  async function persistAssessment(showMessage = true): Promise<DraftAssessment | null> {
    if (!assessment) return null;
    let nextAssessment = assessment;

    if (assessment.folderId) {
      await updateDriveAssessment({
        assessment: {
          id: assessment.id,
          subjectId: assessment.subjectId,
          title: assessment.title,
          date: assessment.date,
          folderId: assessment.folderId,
          systemPrompt: assessment.systemPrompt,
          rubricSource: assessment.rubricSource,
          gradingModel: assessment.gradingModel,
          gradingMode: assessment.gradingMode,
          sourceMaterials: assessment.sourceMaterials ?? [],
          createdAt: assessment.createdAt,
        },
        rubric,
        examples,
      });
      if (showMessage) setMessage("저장했습니다. Drive의 평가 설정도 수정했습니다.");
    } else {
      const saved = await saveDriveAssessment({
        subjectId: params.subjectId,
        assessment: {
          id: assessment.id,
          subjectId: assessment.subjectId,
          title: assessment.title,
          date: assessment.date,
          systemPrompt: assessment.systemPrompt,
          rubricSource: assessment.rubricSource,
          gradingModel: assessment.gradingModel,
          gradingMode: assessment.gradingMode,
          sourceMaterials: assessment.sourceMaterials ?? [],
          createdAt: assessment.createdAt,
        },
        rubric,
        examples,
      });
      nextAssessment = {
        ...assessment,
        folderId: saved.folderId,
        sourceMaterials: saved.sourceMaterials ?? assessment.sourceMaterials ?? [],
      };
      setAssessment(nextAssessment);
      if (showMessage) {
        setMessage("저장했습니다. Drive에 평가 폴더와 설정 파일을 만들었습니다.");
      }
    }

    saveLocalDraft(nextAssessment);
    setError(null);
    return nextAssessment;
  }

  async function save() {
    setError(null);
    setMessage(null);
    try {
      await persistAssessment(true);
    } catch (err) {
      saveLocalDraft(assessment as DraftAssessment);
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  }

  async function handleSourceFiles(files: File[]) {
    if (!files.length || !assessment) return;
    setUploadingSource(true);
    setError(null);
    setMessage(null);
    try {
      const savedAssessment = await persistAssessment(false);
      if (!savedAssessment?.folderId) {
        throw new Error("Drive 평가 폴더가 필요합니다. Google Drive 연결을 먼저 확인해 주세요.");
      }
      const payload = await Promise.all(files.map(readFileAsDataUrl));
      const uploaded = await uploadAssessmentFiles({
        assessmentFolderId: savedAssessment.folderId,
        kind: "source",
        files: payload,
      });
      const nextAssessment = {
        ...savedAssessment,
        sourceMaterials: [...(savedAssessment.sourceMaterials ?? []), ...uploaded.files],
      };
      setAssessment(nextAssessment);
      saveLocalDraft(nextAssessment);
      await updateDriveAssessment({
        assessment: {
          id: nextAssessment.id,
          subjectId: nextAssessment.subjectId,
          title: nextAssessment.title,
          date: nextAssessment.date,
          folderId: savedAssessment.folderId,
          systemPrompt: nextAssessment.systemPrompt,
          rubricSource: nextAssessment.rubricSource,
          gradingModel: nextAssessment.gradingModel,
          gradingMode: nextAssessment.gradingMode,
          sourceMaterials: nextAssessment.sourceMaterials ?? [],
          createdAt: nextAssessment.createdAt,
        },
        rubric,
        examples,
      });
      setMessage("문제/채점기준표 파일을 Drive에 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "첨부 파일 저장에 실패했습니다.");
    } finally {
      setUploadingSource(false);
    }
  }

  async function uploadExampleAttachments(
    exampleId: string,
    files: Array<{ name: string; dataUrl: string }>,
  ): Promise<DriveRef[]> {
    const savedAssessment = await persistAssessment(false);
    if (!savedAssessment?.folderId) {
      throw new Error("Drive 평가 폴더가 필요합니다. Google Drive 연결을 먼저 확인해 주세요.");
    }
    const uploaded = await uploadAssessmentFiles({
      assessmentFolderId: savedAssessment.folderId,
      kind: "example",
      exampleId,
      files,
    });
    setMessage("예시답안 첨부 파일을 Drive에 저장했습니다. 변경 내용을 저장해 주세요.");
    return uploaded.files;
  }

  async function handleExtractRubric() {
    if (!assessment?.systemPrompt.trim()) {
      setError("시스템 프롬프트를 먼저 입력해 주세요.");
      return;
    }
    setExtracting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await extractRubric(assessment.systemPrompt);
      setRubric(result);
      patchAssessment({ rubricSource: "extracted-from-prompt" });
      setMessage("시스템 프롬프트에서 루브릭을 추출했습니다. 확인 후 저장해 주세요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "루브릭 추출에 실패했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  if (!assessment) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8">
        <AppHeader title="평가 설정" backHref={`/subjects/${params.subjectId}/assessments`} />
        <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          평가를 찾을 수 없습니다.
        </p>
      </main>
    );
  }

  const sourceMaterials = assessment.sourceMaterials ?? [];

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <AppHeader
        title="평가 설정"
        backHref={`/subjects/${params.subjectId}/assessments`}
        backLabel="평가 목록"
      />

      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">평가 이름</span>
              <input
                value={assessment.title}
                onChange={(event) => patchAssessment({ title: event.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">날짜</span>
              <input
                type="date"
                value={toDateInput(assessment.date)}
                onChange={(event) => patchAssessment({ date: fromDateInput(event.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">텍스트 채점 모델</span>
            <select
              value={assessment.gradingModel}
              onChange={(event) => patchAssessment({ gradingModel: event.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">기본값 - Gemini 3.5 Flash</option>
              <option value="gemini-3.1-flash-lite">빠름/저비용 - Gemini 3.1 Flash-Lite</option>
              <option value="gemini-3.5-flash">균형/긴 답안 - Gemini 3.5 Flash</option>
              <option value="gemini-3.1-pro-preview">정확도 우선 - Gemini 3.1 Pro</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              이미지 포함 채점은 기본 Gemini 모델을 사용합니다.
            </p>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">기본 채점 방식</span>
            <select
              value={assessment.gradingMode ?? "text-only"}
              onChange={(event) =>
                patchAssessment({
                  gradingMode: event.target.value as NonNullable<typeof assessment.gradingMode>,
                })
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="text-only">텍스트 기반 채점 - 비용 낮음, 빠름</option>
              <option value="image-assisted">이미지 포함 채점 - 수식/도형/그림 답안 권장</option>
              <option value="auto">자동 판단 - 시각 요소에 따라 추천</option>
            </select>
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">문제와 채점기준표</h2>
          <p className="mt-1 text-sm text-slate-500">
            문제지, 채점기준표, 배점표를 이미지나 PDF로 첨부하면 AI가 채점할 때 함께 분석합니다.
          </p>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(event) => void handleSourceFiles(Array.from(event.target.files ?? []))}
            disabled={uploadingSource}
            className="mt-4 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
          />
          <PasteZone
            onFiles={(files) => void handleSourceFiles(files)}
            disabled={uploadingSource}
            label="또는 여기를 클릭한 뒤 Ctrl+V — 문제·채점기준표 캡처(프린트스크린)·이미지·PDF 붙여넣기"
          />
          {sourceMaterials.length > 0 && (
            <ul className="mt-3 space-y-2">
              {sourceMaterials.map((file) => (
                <li
                  key={file.fileId}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAssessment = {
                        ...assessment,
                        sourceMaterials: sourceMaterials.filter(
                          (item) => item.fileId !== file.fileId,
                        ),
                      };
                      setAssessment(nextAssessment);
                      saveLocalDraft(nextAssessment);
                    }}
                    className="ml-3 shrink-0 text-xs font-medium text-red-600"
                  >
                    제거
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">시스템 프롬프트</h2>
              <p className="mt-1 text-sm text-slate-500">
                선택사항입니다. 루브릭을 따로 넣지 않아도 여기에서 채점 기준을 추출할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleExtractRubric()}
              disabled={extracting}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {extracting ? "추출 중" : "프롬프트에서 루브릭 추출"}
            </button>
          </div>
          <textarea
            value={assessment.systemPrompt}
            onChange={(event) => patchAssessment({ systemPrompt: event.target.value })}
            rows={10}
            className="mt-4 min-h-72 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
            placeholder="예: 개념 이해 4점, 논리적 설명 3점, 표현 3점으로 평가한다..."
          />
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">루브릭</h2>
          <RubricBuilder rubric={rubric} onChange={setRubric} />
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">예시답안</h2>
          <ExamplesEditor
            examples={examples}
            onChange={setExamples}
            onUploadAttachments={uploadExampleAttachments}
          />
        </section>
      </div>

      {(message || error) && (
        <p className={`mt-5 text-sm ${error ? "text-red-600" : "text-green-700"}`}>
          {error || message}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => void save()}
          className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          저장
        </button>
      </div>
    </main>
  );
}
