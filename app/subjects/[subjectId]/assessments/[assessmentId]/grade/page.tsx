"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import {
  deleteStudentWorkFromDrive,
  fileToBase64,
  gradeAnswer,
  interpretStudentFromDrive,
  listDriveClasses,
  loadStudentWorkFromDrive,
  readDriveAssessmentBundle,
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
    description: "학생 답안에 수식, 도형, 그래프, 그림이 있으면 AI 해석 결과가 여기에 표시됩니다.",
  },
];

// ⚠️ 크롬은 긴 한국어(약 1500자+)를 "편집 가능한 요소"(textarea·contentEditable)에 렌더링하면
//    렌더러(탭)가 죽는다. 읽기 전용 div 는 길이와 무관하게 안전하다.
//    → 보기는 항상 읽기 div, 편집기에는 짧은 "조각"(EDIT_CHUNK 이하)만 넣는다.
const MASK = "****"; // OCR 이 불명확하다고 본 글자 표시(drive 규약: 별표 4개)
const EDIT_CHUNK = 300; // 인라인 편집기 한 조각의 최대 글자 수(위험선의 약 1/5 — 충분히 안전)

/**
 * 텍스트를 maxLen 이하 조각들로 "정확히 분할"한다(조각을 이어붙이면 원문과 동일).
 * 가능하면 줄바꿈·공백 경계에서 끊어 자연스럽게 나눈다.
 */
function chunkText(text: string, maxLen: number): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxLen, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const minCut = Math.floor(maxLen * 0.5); // 너무 잘게 쪼개지지 않도록 하한
      const nl = slice.lastIndexOf("\n");
      const sp = slice.lastIndexOf(" ");
      if (nl >= minCut) end = i + nl + 1;
      else if (sp >= minCut) end = i + sp + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

/** 읽기 전용 텍스트에서 마스크(****)를 노란색으로 강조해 렌더 */
function renderWithMasks(s: string) {
  const parts = s.split(MASK);
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <span className="rounded bg-yellow-200 px-0.5 font-bold text-yellow-900">{MASK}</span>
      )}
    </span>
  ));
}

/**
 * Drive 파일 API(/api/drive/file/[fileId])로 받은 이미지를 클라이언트 canvas 로 축소해
 * object URL 로 돌려준다. 큰 스캔본을 풀해상도로 들고 있으면 렌더러 메모리가 폭증해 탭이 죽는다.
 * (이 파일 API 는 세션 쿠키 인증이라 next/image 최적화를 못 쓴다 → 직접 축소한다.)
 */
async function loadDownscaledImageUrl(fileId: string, maxEdge = 1500): Promise<string> {
  const res = await fetch(`/api/drive/file/${fileId}`);
  if (!res.ok) throw new Error("이미지 불러오기 실패");
  const blob = await res.blob();
  try {
    const bitmap = await createImageBitmap(blob);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return URL.createObjectURL(blob);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close(); // 원본 디코드 비트맵 즉시 해제(메모리 절약)
    const reduced = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8),
    );
    return URL.createObjectURL(reduced ?? blob);
  } catch {
    return URL.createObjectURL(blob); // 축소 실패 시 원본이라도 표시
  }
}

function friendlyError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  if (
    message.includes("401") ||
    message.includes("UNAUTHENTICATED") ||
    message.includes("Invalid Credentials")
  ) {
    return "Google Drive 로그인이 만료되었습니다. 첫 화면에서 로그아웃 후 다시 Google Drive에 연결한 다음 저장해 주세요.";
  }
  return message;
}

function studentLabel(student: StudentIndexItem) {
  return `${student.grade}-${student.classNo}-${student.studentNo} ${student.name || "이름 없음"}`;
}

export default function GradePage({
  params,
}: {
  params: { subjectId: string; assessmentId: string };
}) {
  const [rubric, setRubric] = useState<Rubric>({ criteria: [] });
  const [examples, setExamples] = useState<ScoringExample[]>([]);
  const [sourceMaterials, setSourceMaterials] = useState<DriveRef[]>([]);
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
  const [selectedStudentFolderId, setSelectedStudentFolderId] = useState("");
  const [selectedPageRefs, setSelectedPageRefs] = useState<DriveRef[]>([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [pageZoom, setPageZoom] = useState(90);
  const [ocrDraft, setOcrDraft] = useState<OcrDraft | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [savingOcr, setSavingOcr] = useState(false);
  const [loadingStudentWork, setLoadingStudentWork] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [gradingMode, setGradingMode] = useState<GradingMode>("text-only");
  const [effectiveGradingMode, setEffectiveGradingMode] = useState<GradingMode>("text-only");
  const [pageObjectUrl, setPageObjectUrl] = useState("");
  const [pageLoading, setPageLoading] = useState(false);
  const [editingChunkIndex, setEditingChunkIndex] = useState<number | null>(null);
  const [chunkDraft, setChunkDraft] = useState("");

  useEffect(() => {
    let active = true;
    const store = loadStore();
    const assessment = store.assessments.find((item) => item.id === params.assessmentId);
    setRubric(store.rubrics[params.assessmentId] ?? { criteria: [] });
    setExamples(store.examples[params.assessmentId] ?? []);
    setSourceMaterials(assessment?.sourceMaterials ?? []);
    setSystemPrompt(assessment?.systemPrompt ?? "");
    setModel(assessment?.gradingModel ?? "");
    setGradingMode(assessment?.gradingMode ?? "text-only");
    const savedClasses = store.classIndexes[params.assessmentId] ?? [];
    setClassIndexes(savedClasses);
    const firstStudent = savedClasses.flatMap((item) => item.students)[0];
    if (firstStudent) {
      setSelectedStudentFolderId(firstStudent.folderId);
      setSelectedPageRefs(firstStudent.pageRefs ?? []);
      void loadSavedStudentWork(firstStudent.folderId);
    }

    async function loadDriveClasses() {
      if (!assessment?.folderId) return;
      setLoadingClasses(true);
      try {
        const bundle = await readDriveAssessmentBundle(assessment.folderId);
        if (!active) return;
        if (bundle.assessment) {
          setRubric(bundle.rubric);
          setExamples(bundle.examples);
          setSourceMaterials(bundle.assessment.sourceMaterials ?? []);
          setSystemPrompt(bundle.assessment.systemPrompt ?? "");
          setModel(bundle.assessment.gradingModel ?? "");
          setGradingMode(bundle.assessment.gradingMode ?? "text-only");
        }
        const driveClasses = await listDriveClasses(assessment.folderId);
        if (!active) return;
        setClassIndexes(driveClasses);
        const latestStore = loadStore();
        saveStore({
          ...latestStore,
          classIndexes: {
            ...latestStore.classIndexes,
            [params.assessmentId]: driveClasses,
          },
        });
        const firstDriveStudent = driveClasses.flatMap((item) => item.students)[0];
        if (firstDriveStudent) {
          setSelectedStudentFolderId(firstDriveStudent.folderId);
          setSelectedPageRefs(firstDriveStudent.pageRefs ?? []);
          setSelectedPageIndex(0);
          void loadSavedStudentWork(firstDriveStudent.folderId);
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
  const maxTotal = useMemo(
    () =>
      scores.reduce(
        (sum, item) => sum + (typeof item.maxScore === "number" ? item.maxScore : 0),
        0,
      ),
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

  const selectedPage = selectedPageRefs[selectedPageIndex] ?? selectedPageRefs[0];

  // 교사 확정 답안(OCR/입력 텍스트)을 인라인 편집용 짧은 조각으로 분할 + 마스크(****) 개수
  const answerChunks = useMemo(() => chunkText(answerText, EDIT_CHUNK), [answerText]);
  const maskCount = useMemo(() => answerText.split(MASK).length - 1, [answerText]);

  // 선택 페이지가 바뀌면 축소 이미지를 새로 로드하고, 이전 object URL 은 해제한다.
  useEffect(() => {
    let revoked = false;
    let createdUrl = "";
    const fileId = selectedPage?.fileId;
    if (!fileId) {
      setPageObjectUrl("");
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    (async () => {
      try {
        const url = await loadDownscaledImageUrl(fileId);
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setPageObjectUrl(url);
      } catch {
        if (!revoked) setPageObjectUrl("");
      } finally {
        if (!revoked) setPageLoading(false);
      }
    })();
    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPage?.fileId]);

  function startChunkEdit(i: number) {
    setEditingChunkIndex(i);
    setChunkDraft(answerChunks[i] ?? "");
  }
  function cancelChunkEdit() {
    setEditingChunkIndex(null);
    setChunkDraft("");
  }
  function applyChunkEdit() {
    if (editingChunkIndex === null) return;
    const next = answerChunks.slice();
    if (editingChunkIndex >= next.length) next.push(chunkDraft);
    else next[editingChunkIndex] = chunkDraft;
    setAnswerText(next.join(""));
    setEditingChunkIndex(null);
    setChunkDraft("");
  }

  async function loadSavedStudentWork(folderId: string) {
    if (!folderId) return;
    setLoadingStudentWork(true);
    try {
      const saved = await loadStudentWorkFromDrive(folderId);
      const confirmed = saved.ocrConfirmed ?? saved.ocrDraft;
      if (confirmed) {
        setOcrDraft(saved.ocrDraft ?? confirmed);
        setAnswerText(confirmed.text);
        setVisualElements(confirmed.visualElements);
      } else {
        setOcrDraft(null);
        setAnswerText(
          "여기에 교사가 확정한 OCR/답안 해석 결과가 들어갑니다. 불명확한 부분은 ****로 표시하고, 교사가 확인한 뒤 채점합니다.",
        );
        setVisualElements(sampleVisuals);
      }

      setAiResult(saved.aiGrading);
      const gradingToShow = saved.finalGrading ?? saved.aiGrading;
      if (gradingToShow) {
        setScores(gradingToShow.scores);
        setOverallReason(gradingToShow.overallReason);
        setFeedback(gradingToShow.feedback);
        setEffectiveGradingMode(gradingToShow.gradingMode ?? "text-only");
      } else {
        setScores([]);
        setOverallReason("");
        setFeedback("");
      }
      if (saved.finalGrading) {
        setClassIndexes((currentClasses) =>
          currentClasses.map((classIndex) => ({
            ...classIndex,
            students: classIndex.students.map((student) =>
              student.folderId === folderId
                ? {
                    ...student,
                    status: "final-saved" as const,
                    totalScore: saved.finalGrading?.totalScore ?? student.totalScore,
                    finalGrading: saved.finalGrading,
                    aiGrading: saved.aiGrading,
                  }
                : student,
            ),
          })),
        );
        setMessage("저장된 교사 최종 채점 결과를 불러왔습니다.");
      } else if (saved.aiGrading || confirmed) {
        setMessage("저장된 OCR/AI 채점 결과를 불러왔습니다.");
      } else {
        setMessage(null);
      }
    } catch (err) {
      setError(friendlyError(err, "학생 저장 결과를 불러오지 못했습니다."));
    } finally {
      setLoadingStudentWork(false);
    }
  }

  function selectStudent(folderId: string) {
    setSelectedStudentFolderId(folderId);
    const student = students.find((item) => item.folderId === folderId);
    setSelectedPageRefs(student?.pageRefs ?? []);
    setSelectedPageIndex(0);
    setAiResult(null);
    setScores([]);
    setOverallReason("");
    setFeedback("");
    setMessage(null);
    setError(null);
    setEditingChunkIndex(null);
    setChunkDraft("");
    void loadSavedStudentWork(folderId);
  }

  async function deleteStudent(student: StudentIndexItem) {
    const assessment = loadStore().assessments.find((item) => item.id === params.assessmentId);
    if (!assessment?.folderId) {
      setError("평가 Drive 폴더를 찾을 수 없어 학생을 삭제할 수 없습니다.");
      return;
    }
    const ok = window.confirm(
      `${studentLabel(student)} 학생 답안을 목록에서 삭제하고 Drive 폴더를 휴지통으로 보낼까요?`,
    );
    if (!ok) return;
    setDeletingStudentId(student.folderId);
    setError(null);
    setMessage(null);
    try {
      await deleteStudentWorkFromDrive({
        assessmentFolderId: assessment.folderId,
        studentFolderId: student.folderId,
      });
      const nextClasses = classIndexes.map((classIndex) => ({
        ...classIndex,
        students: classIndex.students.filter((item) => item.folderId !== student.folderId),
      }));
      setClassIndexes(nextClasses);
      const store = loadStore();
      saveStore({
        ...store,
        classIndexes: {
          ...store.classIndexes,
          [params.assessmentId]: nextClasses,
        },
      });
      if (selectedStudentFolderId === student.folderId) {
        const nextStudent = nextClasses.flatMap((item) => item.students)[0];
        if (nextStudent) {
          selectStudent(nextStudent.folderId);
        } else {
          setSelectedStudentFolderId("");
          setSelectedPageRefs([]);
          setScores([]);
          setOverallReason("");
          setFeedback("");
        }
      }
      setMessage("학생 답안을 삭제했습니다. Drive에서는 휴지통으로 이동했습니다.");
    } catch (err) {
      setError(friendlyError(err, "학생 삭제 실패"));
    } finally {
      setDeletingStudentId(null);
    }
  }

  async function runAi() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      if (
        rubric.criteria.length === 0 &&
        !systemPrompt.trim() &&
        sourceMaterials.length === 0
      ) {
        throw new Error("루브릭, 시스템 프롬프트, 문제/채점기준표 첨부 중 하나는 필요합니다.");
      }
      const modeToUse = gradingMode === "auto" ? recommendedMode : gradingMode;
      setEffectiveGradingMode(modeToUse);
      const answerImagesPromise =
        modeToUse === "image-assisted"
          ? Promise.all(
              selectedPageRefs.map(async (pageRef) => {
                const image = await fileToBase64(pageRef.fileId);
                return { ...image, name: pageRef.name };
              }),
            )
          : Promise.resolve([]);
      const sourceMaterialsPromise = Promise.all(
        sourceMaterials.map(async (file) => {
          const loaded = await fileToBase64(file.fileId);
          return {
            ...loaded,
            mimeType: file.mimeType || loaded.mimeType,
            name: file.name,
          };
        }),
      );
      const exampleMaterialsPromise = Promise.all(
        examples.flatMap((example) =>
          example.attachments.map(async (file) => {
            const loaded = await fileToBase64(file.fileId);
            return {
              exampleId: example.id,
              ...loaded,
              mimeType: file.mimeType || loaded.mimeType,
              name: file.name,
            };
          }),
        ),
      );
      const [answerImages, loadedSourceMaterials, loadedExampleMaterials] = await Promise.all([
        answerImagesPromise,
        sourceMaterialsPromise,
        exampleMaterialsPromise,
      ]);
      const result = await gradeAnswer({
        rubric,
        examples,
        systemPrompt,
        sourceMaterials: loadedSourceMaterials,
        exampleMaterials: loadedExampleMaterials,
        confirmedAnswerText: answerText,
        visualElements,
        answerImages,
        gradingMode: modeToUse,
        model,
      });
      setAiResult(result);
      setScores(result.scores);
      setOverallReason(result.overallReason);
      setFeedback(result.feedback);
      setMessage("AI 채점 초안을 만들고 채점표에 반영했습니다. 필요한 부분을 수정한 뒤 최종 저장하세요.");
    } catch (err) {
      setError(friendlyError(err, "AI 채점 실패"));
    } finally {
      setRunning(false);
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
      setEditingChunkIndex(null);
      setChunkDraft("");
      const nextRecommendedMode = recommendGradingMode(
        draft.visualElements.map((item) => item.kind),
      );
      if (gradingMode === "auto") setEffectiveGradingMode(nextRecommendedMode);
      setMessage("AI가 원본 페이지를 해석했습니다. 내용을 확인한 뒤 답안을 저장하세요.");
    } catch (err) {
      setError(friendlyError(err, "AI OCR/해석 실패"));
    } finally {
      setInterpreting(false);
    }
  }

  async function confirmOcr() {
    setError(null);
    setMessage(null);
    setSavingOcr(true);
    try {
      if (!selectedStudentFolderId) throw new Error("학생을 먼저 선택하세요.");
      const confirmed = {
        text: answerText,
        maskedTokens: ocrDraft?.maskedTokens ?? [],
        visualElements,
        confirmedByTeacher: true as const,
        confirmedAt: Date.now(),
      };
      const draft = {
        text: answerText,
        maskedTokens: ocrDraft?.maskedTokens ?? [],
        visualElements,
      };
      await saveStudentWorkToDrive({
        studentFolderId: selectedStudentFolderId,
        ocrDraft: draft,
        ocrConfirmed: confirmed,
      });
      setOcrDraft(draft);
      setMessage("교사가 확인한 답안을 저장했습니다.");
    } catch (err) {
      setError(friendlyError(err, "OCR 확정 저장 실패"));
    } finally {
      setSavingOcr(false);
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
        gradingMode: effectiveGradingMode,
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
      const nextClasses = classIndexes.map((classIndex) => ({
        ...classIndex,
        students: classIndex.students.map((student) =>
          student.folderId === selectedStudentFolderId
            ? {
                ...student,
                status: "final-saved" as const,
                totalScore: total,
                aiGrading: aiResult,
                finalGrading,
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
      setError(friendlyError(err, "최종 저장 실패"));
    }
  }

  return (
    <main className="mx-auto max-w-[1800px] px-5 py-8">
      <AppHeader
        title="채점"
        backHref={`/subjects/${params.subjectId}/assessments`}
        backLabel="평가 목록"
      />

      <div className="grid gap-5 xl:grid-cols-[190px_minmax(520px,1fr)_minmax(520px,0.95fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto border-r border-slate-200 bg-white">
            {students.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">저장된 학생이 없습니다.</p>
            ) : (
              students.map((student) => {
                const selected = student.folderId === selectedStudentFolderId;
                const completed = student.status === "final-saved" || Boolean(student.finalGrading);
                return (
                  <div
                    key={student.folderId}
                    className={`flex items-center gap-2 px-2 py-2 text-sm ${
                      selected ? "bg-blue-50" : "bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectStudent(student.folderId)}
                      className="min-w-0 flex-1 truncate text-left text-slate-900"
                      title={studentLabel(student)}
                    >
                      {studentLabel(student)}
                    </button>
                    <span
                      className={
                        completed
                          ? "shrink-0 text-green-700"
                          : "shrink-0 rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800"
                      }
                    >
                      {completed ? "✓" : "검수"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void deleteStudent(student)}
                      disabled={deletingStudentId === student.folderId}
                      className="shrink-0 px-1 text-lg leading-none text-slate-300 hover:text-red-600 disabled:opacity-40"
                      title="학생 삭제"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 xl:hidden">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="block flex-1">
                <span className="text-sm font-medium text-slate-700">학생 선택</span>
                <select
                  value={selectedStudentFolderId}
                  onChange={(event) => selectStudent(event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">학생 선택</option>
                  {students.map((student) => (
                    <option key={student.folderId} value={student.folderId}>
                      {studentLabel(student)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedStudent && (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  선택: {studentLabel(selectedStudent)}
                </p>
              )}
            </div>
            {loadingClasses && (
              <p className="mt-2 text-xs text-slate-500">Drive 학생 목록을 불러오는 중입니다.</p>
            )}
            {loadingStudentWork && (
              <p className="mt-2 text-xs text-slate-500">선택한 학생의 저장된 채점 결과를 불러오는 중입니다.</p>
            )}
            {students.length > 0 && (
              <div className="mt-4 max-h-56 overflow-auto rounded-md border border-slate-200">
                {students.map((student) => {
                  const selected = student.folderId === selectedStudentFolderId;
                  return (
                    <div
                      key={student.folderId}
                      className={`flex items-center gap-2 border-t border-slate-100 px-3 py-2 first:border-t-0 ${
                        selected ? "bg-brand-50" : "bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectStudent(student.folderId)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-slate-800"
                      >
                        {studentLabel(student)}
                        {(student.status === "final-saved" || student.finalGrading) && (
                          <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
                            완료
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteStudent(student)}
                        disabled={deletingStudentId === student.folderId}
                        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">원본 페이지</h2>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setSelectedPageIndex((value) => Math.max(0, value - 1))}
                  disabled={selectedPageIndex === 0}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  이전
                </button>
                <span className="min-w-16 text-center text-slate-600">
                  {selectedPageRefs.length ? selectedPageIndex + 1 : 0} / {selectedPageRefs.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPageIndex((value) =>
                      Math.min(selectedPageRefs.length - 1, value + 1),
                    )
                  }
                  disabled={selectedPageIndex >= selectedPageRefs.length - 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  다음
                </button>
                <button
                  type="button"
                  onClick={() => setPageZoom((value) => Math.max(75, value - 25))}
                  className="rounded-md border border-slate-300 px-3 py-1.5"
                >
                  -
                </button>
                <span className="min-w-14 text-center text-slate-600">{pageZoom}%</span>
                <button
                  type="button"
                  onClick={() => setPageZoom((value) => Math.min(250, value + 25))}
                  className="rounded-md border border-slate-300 px-3 py-1.5"
                >
                  +
                </button>
              </div>
            </div>
            {selectedPage ? (
              <div className="mt-4 h-[48vh] min-h-[420px] overflow-auto rounded-md border border-slate-200 bg-slate-100 p-4">
                {pageLoading ? (
                  <p className="py-16 text-center text-sm text-slate-500">이미지 불러오는 중…</p>
                ) : pageObjectUrl ? (
                  <div className="mx-auto" style={{ width: `${pageZoom}%`, minWidth: "460px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pageObjectUrl}
                      alt={selectedPage.name}
                      className="w-full rounded border border-slate-300 bg-white shadow-sm"
                    />
                    <p className="mt-2 text-xs text-slate-500">{selectedPage.name}</p>
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">
                    이미지를 불러오지 못했습니다. Google Drive 연결을 확인하세요.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                원본 페이지가 없습니다. PDF 업로드 화면에서 Drive 저장을 다시 확인하세요.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">교사 확정 답안</h2>
                <p className="mt-1 text-sm text-slate-500">
                  원본 페이지와 OCR 결과를 비교한 뒤 이 텍스트를 기준으로 채점합니다.
                </p>
              </div>
              {ocrDraft && (
                <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                  답안 있음
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {maskCount > 0 && (
                    <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      불명확 {maskCount}곳 (****)
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {answerText.length.toLocaleString()}자
                  </span>
                </div>
                <span className="text-xs text-slate-400">고칠 부분을 클릭해 수정</span>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                긴 답안 전체를 한 칸에 넣지 않고, 고칠 부분만 클릭해 고칩니다(긴 한글을 한
                편집창에 넣으면 탭이 죽는 문제 예방). 노란색 ****는 OCR이 불명확하다고 본 부분입니다.
              </p>
              <div className="h-[32vh] min-h-[280px] space-y-0.5 overflow-auto rounded-md border border-slate-300 bg-slate-50 p-2 text-sm leading-6">
                {answerChunks.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingChunkIndex(0);
                      setChunkDraft("");
                    }}
                    className="w-full rounded px-2 py-2 text-left text-sm text-slate-400 hover:bg-amber-50"
                  >
                    (텍스트 없음 — 클릭해 입력)
                  </button>
                ) : (
                  answerChunks.map((chunk, i) =>
                    editingChunkIndex === i ? (
                      <div key={i} className="rounded-md border border-brand-500 bg-white p-2">
                        <textarea
                          autoFocus
                          value={chunkDraft}
                          onChange={(event) => setChunkDraft(event.target.value)}
                          rows={Math.min(8, Math.max(2, chunkDraft.split("\n").length + 1))}
                          spellCheck={false}
                          autoCorrect="off"
                          autoCapitalize="off"
                          className="w-full resize-y rounded border border-slate-300 p-2 text-sm leading-relaxed"
                        />
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <button
                            onClick={cancelChunkEdit}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            취소
                          </button>
                          <button
                            onClick={applyChunkEdit}
                            className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
                          >
                            적용
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={i}
                        role="button"
                        tabIndex={0}
                        onClick={() => startChunkEdit(i)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            startChunkEdit(i);
                          }
                        }}
                        title="클릭하여 이 부분 수정"
                        className="cursor-text whitespace-pre-wrap break-words rounded px-2 py-1 leading-relaxed text-slate-700 hover:bg-amber-50"
                      >
                        {renderWithMasks(chunk)}
                      </div>
                    ),
                  )
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void runAiInterpretation()}
                disabled={interpreting || !selectedStudentFolderId}
                className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {interpreting ? "AI 해석 중" : "AI OCR/해석 실행"}
              </button>
              <button
                onClick={() => void confirmOcr()}
                disabled={savingOcr || !selectedStudentFolderId}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                확인한 답안 저장
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
                  AI 채점 결과는 아래 교사 최종 채점표에 바로 반영됩니다. 다시 채점하려면 AI 채점 실행을 한 번 더 누르세요.
                </p>
              </div>
              <button
                onClick={() => void runAi()}
                disabled={running}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {running ? "채점 중" : "AI 채점 실행"}
              </button>
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
                {gradingMode === "auto" &&
                  ` · 실제 적용: ${effectiveGradingMode === "image-assisted" ? "이미지 포함" : "텍스트 기반"}`}
              </p>
            </div>
            {aiResult && (
              <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold">AI 총점: {aiResult.totalScore}</p>
                <p className="mt-1 text-xs text-slate-500">
                  사용 방식: {aiResult.gradingMode === "image-assisted" ? "이미지 포함 채점" : "텍스트 기반 채점"}
                </p>
                <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                  <div className="grid grid-cols-[1fr_96px] bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                    <span>채점 요소</span>
                    <span className="text-right">점수</span>
                  </div>
                  {aiResult.scores.map((score, index) => (
                    <div key={`${score.criterionName}-${index}`} className="border-t border-slate-100 px-3 py-2">
                      <div className="grid grid-cols-[1fr_96px] gap-3">
                        <p className="font-medium text-slate-800">{score.criterionName}</p>
                        <p className="text-right font-semibold text-slate-950">
                          {score.score}
                          {typeof score.maxScore === "number" ? ` / ${score.maxScore}` : ""}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                        {score.reason}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 whitespace-pre-wrap font-medium text-slate-800">
                  {aiResult.overallReason}
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
                {maxTotal > 0 ? ` / ${maxTotal}` : ""}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {scores.length === 0 ? (
                <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  AI 채점 실행을 누르거나, 채점 요소를 직접 입력하세요.
                </p>
              ) : (
                scores.map((score, index) => (
                  <div key={index} className="rounded-md border border-slate-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
                      <input
                        value={score.criterionName}
                        onChange={(event) => {
                          const next = [...scores];
                          next[index] = { ...score, criterionName: event.target.value };
                          setScores(next);
                        }}
                        placeholder="채점 요소"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        value={score.maxScore ?? ""}
                        onChange={(event) => {
                          const next = [...scores];
                          next[index] = {
                            ...score,
                            maxScore:
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                          };
                          setScores(next);
                        }}
                        placeholder="만점"
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
                        placeholder="부여 점수"
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
                      rows={4}
                      className="mt-3 h-28 w-full resize-y overflow-auto rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
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
                rows={5}
                className="mt-1 h-40 w-full resize-y overflow-auto rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">최종 피드백</span>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={7}
                className="mt-1 h-48 w-full resize-y overflow-auto rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
              />
            </label>

            {(message || error) && (
              <p className={`mt-4 whitespace-pre-wrap text-sm ${error ? "text-red-600" : "text-green-700"}`}>
                {error || message}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => void saveFinal()}
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
