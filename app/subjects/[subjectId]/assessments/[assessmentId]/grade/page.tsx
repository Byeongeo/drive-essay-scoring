"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import {
  fileToBase64,
  gradeAnswer,
  interpretStudentFromDrive,
  listDriveClasses,
  recommendGradingMode,
  saveStudentWorkToDrive,
} from "@/lib/api";
import { loadStore, saveStore } from "@/lib/client-store";
import type {
  ClassIndex,
  CriterionScore,
  DriveRef,
  GradingMode,
  GradingSnapshot,
  OcrDraft,
  Rubric,
  ScoringExample,
  StudentIndexItem,
  VisualElement,
} from "@/lib/types";

const sampleVisuals: VisualElement[] = [
  {
    kind: "diagram",
    description: "학생 답안에 간단한 도형이나 그래프가 있는 경우 이 영역에 AI 해석이 표시됩니다.",
  },
];

export default function GradePage({
  params,
}: {
  params: { subjectId: string; assessmentId: string };
}) {
  const [rubric, setRubric] = useState<Rubric>({ criteria: [] });
  const [examples, setExamples] = useState<ScoringExample[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");
  const [answerText, setAnswerText] = useState(
    "여기에 교사가 확정한 OCR/답안 해석 결과가 들어갑니다. 불명확한 부분은 ****로 표시하고, 교사가 확인한 뒤 채점합니다.",
  );
  const [visualElements, setVisualElements] = useState<VisualElement[]>(sampleVisuals);
  const [aiResult, setAiResult] = useState<GradingSnapshot | null>(null);
  const [scores, setScores] = useState<CriterionScore[]>([]);
  const [overallReason, setOverallReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classIndexes, setClassIndexes] = useState<ClassIndex[]>([]);
  const [selectedStudentFolderId, setSelectedStudentFolderId] = useState<string>("");
  const [selectedPageRefs, setSelectedPageRefs] = useState<DriveRef[]>([]);
  const [ocrDraft, setOcrDraft] = useState<OcrDraft | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [gradingMode, setGradingMode] = useState<GradingMode>("text-only");
  const [effectiveGradingMode, setEffectiveGradingMode] = useState<GradingMode>("text-only");

  useEffect(() => {
    let active = true;
    const store = loadStore();
    const assessment = store.assessments.find((item) => item.id === params.assessmentId);
    setRubric(store.rubrics[params.assessmentId] ?? { criteria: [] });
    setExamples(store.examples[params.assessmentId] ?? []);
    setSystemPrompt(assessment?.systemPrompt ?? "");
    setModel(assessment?.gradingModel ?? "");
    setGradingMode(assessment?.gradingMode ?? "text-only");
    const savedClasses = store.classIndexes[params.assessmentId] ?? [];
    setClassIndexes(savedClasses);
    const firstStudent = savedClasses.flatMap((item) => item.students)[0];
    if (firstStudent) {
      setSelectedStudentFolderId(firstStudent.folderId);
      setSelectedPageRefs(firstStudent.pageRefs ?? []);
    }

    async function loadDriveClasses() {
      if (!assessment?.folderId) return;
      setLoadingClasses(true);
      try {
        const driveClasses = await listDriveClasses(assessment.folderId);
        if (!active) return;
        setClassIndexes(driveClasses);
        const firstDriveStudent = driveClasses.flatMap((item) => item.students)[0];
        if (firstDriveStudent) {
          setSelectedStudentFolderId(firstDriveStudent.folderId);
          setSelectedPageRefs(firstDriveStudent.pageRefs ?? []);
        }
      } catch {
        // Keep local class index if Drive is unavailable.
      } finally {
        if (active) setLoadingClasses(false);
      }
    }
    void loadDriveClasses();
    return () => {
      active = false;
    };
  }, [params.assessmentId]);

  const total = useMemo(
    () => scores.reduce((sum, item) => sum + Number(item.score || 0), 0),
    [scores],
  );

  const students = useMemo(
    () => classIndexes.flatMap((classIndex) => classIndex.students),
    [classIndexes],
  );

  const selectedStudent = useMemo<StudentIndexItem | null>(
    () => students.find((student) => student.folderId === selectedStudentFolderId) ?? null,
    [students, selectedStudentFolderId],
  );

  const recommendedMode = useMemo(
    () => recommendGradingMode(visualElements.map((item) => item.kind)),
    [visualElements],
  );

  function bringAiResult() {
    if (!aiResult) return;
    setScores(aiResult.scores);
    setOverallReason(aiResult.overallReason);
    setFeedback(aiResult.feedback);
    setMessage("AI 채점 결과 전체를 편집창으로 가져왔습니다.");
  }

  async function runAi() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      if (rubric.criteria.length === 0) {
        throw new Error("루브릭이 없습니다. 회차 설정에서 루브릭을 입력하거나 프롬프트에서 추출하세요.");
      }
      const modeToUse =
        gradingMode === "auto" ? recommendedMode : gradingMode;
      setEffectiveGradingMode(modeToUse);
      const answerImages =
        modeToUse === "image-assisted"
          ? await Promise.all(
              selectedPageRefs.map(async (pageRef) => {
                const image = await fileToBase64(pageRef.fileId);
                return {
                  ...image,
                  name: pageRef.name,
                };
              }),
            )
          : [];
      const result = await gradeAnswer({
        rubric,
        examples,
        systemPrompt,
        confirmedAnswerText: answerText,
        visualElements,
        answerImages,
        gradingMode: modeToUse,
        model,
      });
      setAiResult(result);
      setMessage("AI 채점 초안을 만들었습니다. 결과 전체 가져오기를 누르면 수정할 수 있습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 채점 실패");
    } finally {
      setRunning(false);
    }
  }

  async function makeOcrDraft() {
    setError(null);
    setMessage(null);
    const draft: OcrDraft = {
      text: answerText,
      maskedTokens: [],
      visualElements,
    };
    setOcrDraft(draft);
    try {
      if (!selectedStudentFolderId) throw new Error("학생을 먼저 선택하세요.");
      await saveStudentWorkToDrive({
        studentFolderId: selectedStudentFolderId,
        ocrDraft: draft,
      });
      setMessage("ocr-draft.json을 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR 초안 저장 실패");
    }
  }

  async function runAiInterpretation() {
    setError(null);
    setMessage(null);
    setInterpreting(true);
    try {
      if (!selectedStudentFolderId) throw new Error("학생을 먼저 선택하세요.");
      if (selectedPageRefs.length === 0) throw new Error("선택한 학생의 원본 페이지가 없습니다.");
      const draft = await interpretStudentFromDrive({
        studentFolderId: selectedStudentFolderId,
        pageRefs: selectedPageRefs,
      });
      setOcrDraft(draft);
      setAnswerText(draft.text);
      setVisualElements(draft.visualElements);
      const nextRecommendedMode = recommendGradingMode(
        draft.visualElements.map((item) => item.kind),
      );
      if (gradingMode === "auto") setEffectiveGradingMode(nextRecommendedMode);
      setMessage("AI가 원본 페이지를 해석해 ocr-draft.json을 저장했습니다. 내용을 확인한 뒤 확정 저장하세요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI OCR/해석 실패");
    } finally {
      setInterpreting(false);
    }
  }

  async function confirmOcr() {
    setError(null);
    setMessage(null);
    try {
      if (!selectedStudentFolderId) throw new Error("학생을 먼저 선택하세요.");
      const confirmed = {
        text: answerText,
        maskedTokens: ocrDraft?.maskedTokens ?? [],
        visualElements,
        confirmedByTeacher: true as const,
        confirmedAt: Date.now(),
      };
      await saveStudentWorkToDrive({
        studentFolderId: selectedStudentFolderId,
        ocrConfirmed: confirmed,
      });
      setMessage("ocr-confirmed.json을 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR 확정 저장 실패");
    }
  }

  async function saveFinal() {
    setError(null);
    setMessage(null);
    try {
      if (!selectedStudentFolderId) {
        throw new Error("저장할 학생을 선택하세요. PDF 업로드 화면에서 먼저 Drive 저장을 해야 학생 목록이 생깁니다.");
      }
      const finalGrading = {
        scores,
        totalScore: total,
        overallReason,
        feedback,
        confirmedByTeacher: true as const,
        confirmedAt: Date.now(),
      };
      await saveStudentWorkToDrive({
        studentFolderId: selectedStudentFolderId,
        aiGrading: aiResult ?? undefined,
        finalGrading,
      });
      const store = loadStore();
      const currentClasses = store.classIndexes[params.assessmentId] ?? classIndexes;
      const nextClasses = currentClasses.map((classIndex) => ({
        ...classIndex,
        students: classIndex.students.map((student) =>
          student.folderId === selectedStudentFolderId
            ? {
                ...student,
                status: "final-saved" as const,
                totalScore: total,
                updatedAt: Date.now(),
              }
            : student,
        ),
      }));
      saveStore({
        ...store,
        classIndexes: {
          ...store.classIndexes,
          [params.assessmentId]: nextClasses,
        },
      });
      setClassIndexes(nextClasses);
      setMessage("선택한 학생 폴더에 ai-grading.json/final-grading.json을 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "최종 저장 실패");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <AppHeader
        title="채점"
        backHref={`/subjects/${params.subjectId}/assessments`}
        backLabel="회차 목록"
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">학생 선택</h2>
            <p className="mt-1 text-sm text-slate-500">
              PDF 업로드 화면에서 Drive에 저장한 학생 목록입니다.
            </p>
            <select
              value={selectedStudentFolderId}
              onChange={(event) => {
                const folderId = event.target.value;
                setSelectedStudentFolderId(folderId);
                const student = students.find((item) => item.folderId === folderId);
                setSelectedPageRefs(student?.pageRefs ?? []);
              }}
              className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">학생 선택</option>
              {students.map((student) => (
                <option key={student.folderId} value={student.folderId}>
                  {student.grade}학년 {student.classNo}반 {student.studentNo}번 {student.name || "이름 없음"}
                </option>
              ))}
            </select>
            {loadingClasses && <p className="mt-2 text-xs text-slate-500">Drive 학생 목록 불러오는 중</p>}
            {selectedStudent && (
              <p className="mt-2 text-xs text-slate-500">
                선택: {selectedStudent.grade}학년 {selectedStudent.classNo}반 {selectedStudent.studentNo}번 {selectedStudent.name}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">원본 페이지</h2>
            {selectedPageRefs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                원본 페이지가 없습니다. PDF 업로드 화면에서 Drive 저장을 다시 확인하세요.
              </p>
            ) : (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {selectedPageRefs.map((pageRef) => (
                  <div key={pageRef.fileId} className="w-40 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/drive/file/${pageRef.fileId}`}
                      alt={pageRef.name}
                      className="h-56 w-40 rounded border border-slate-200 object-contain"
                    />
                    <p className="mt-1 truncate text-xs text-slate-500">{pageRef.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">교사 확정 답안</h2>
            <p className="mt-1 text-sm text-slate-500">
              OCR과 이미지 해석을 확인한 뒤 이 텍스트를 기준으로 채점합니다.
            </p>
            <textarea
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              rows={14}
              className="mt-4 min-h-96 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void runAiInterpretation()}
                disabled={interpreting}
                className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {interpreting ? "AI 해석 중" : "AI OCR/해석 실행"}
              </button>
              <button
                onClick={() => void makeOcrDraft()}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                OCR 초안 저장
              </button>
              <button
                onClick={() => void confirmOcr()}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                OCR/해석 확정 저장
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">수식/도형/그림 해석</h2>
            <textarea
              value={visualElements.map((item) => `${item.kind}: ${item.description}`).join("\n")}
              onChange={(event) =>
                setVisualElements(
                  event.target.value
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => ({ kind: "other", description: line })),
                )
              }
              rows={8}
              className="mt-4 min-h-52 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
            />
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">AI 채점 초안</h2>
                <p className="mt-1 text-sm text-slate-500">
                  AI가 만든 점수, 근거, 피드백 전체를 교사 편집창으로 가져옵니다.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void runAi()}
                  disabled={running}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {running ? "채점 중" : "AI 채점 실행"}
                </button>
                <button
                  onClick={bringAiResult}
                  disabled={!aiResult}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  결과 전체 가져오기
                </button>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <label className="block text-sm font-medium text-slate-700">채점 방식</label>
              <select
                value={gradingMode}
                onChange={(event) => setGradingMode(event.target.value as GradingMode)}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="text-only">텍스트 기반 채점 - 비용 낮음, 빠름</option>
                <option value="image-assisted">이미지 포함 채점 - 수식/도형/그림 답안 권장</option>
                <option value="auto">자동 판단 - 시각 요소가 있으면 이미지 포함 권장</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                현재 추천: {recommendedMode === "image-assisted" ? "이미지 포함 채점" : "텍스트 기반 채점"}
                {gradingMode === "auto" && ` · 실제 적용: ${effectiveGradingMode === "image-assisted" ? "이미지 포함" : "텍스트 기반"}`}
              </p>
            </div>
            {aiResult && (
              <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold">AI 총점: {aiResult.totalScore}</p>
                <p className="mt-1 text-xs text-slate-500">
                  사용 방식: {aiResult.gradingMode === "image-assisted" ? "이미지 포함 채점" : "텍스트 기반 채점"}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{aiResult.feedback}</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">교사 최종 채점</h2>
              <div className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                총점 {total}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {scores.length === 0 ? (
                <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  AI 결과 전체 가져오기를 누르거나, 채점 요소를 직접 입력하세요.
                </p>
              ) : (
                scores.map((score, index) => (
                  <div key={index} className="rounded-md border border-slate-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                      <input
                        value={score.criterionName}
                        onChange={(event) => {
                          const next = [...scores];
                          next[index] = { ...score, criterionName: event.target.value };
                          setScores(next);
                        }}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        value={score.score}
                        onChange={(event) => {
                          const next = [...scores];
                          next[index] = { ...score, score: Number(event.target.value) };
                          setScores(next);
                        }}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <textarea
                      value={score.reason}
                      onChange={(event) => {
                        const next = [...scores];
                        next[index] = { ...score, reason: event.target.value };
                        setScores(next);
                      }}
                      rows={6}
                      className="mt-3 min-h-40 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
                    />
                  </div>
                ))
              )}
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">종합 채점 근거</span>
              <textarea
                value={overallReason}
                onChange={(event) => setOverallReason(event.target.value)}
                rows={8}
                className="mt-1 min-h-56 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">최종 피드백</span>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={10}
                className="mt-1 min-h-72 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
              />
            </label>

            {(message || error) && (
              <p className={`mt-4 text-sm ${error ? "text-red-600" : "text-green-700"}`}>
                {error || message}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={saveFinal}
                className="rounded-md bg-slate-950 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                최종 저장
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
