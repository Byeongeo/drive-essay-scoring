"use client";

import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { classifyPage, createClassSession, saveClassStudent } from "@/lib/api";
import { loadStore, saveStore } from "@/lib/client-store";
import { dataUrlToBase64, renderPdfToImages, type RenderedPage } from "@/lib/pdf";
import { deriveStudentGroups } from "@/lib/student-grouping";
import type { HeaderExtraction } from "@/lib/types";

type Step = "select" | "processing" | "review";
type SaveState = "idle" | "saving" | "saved" | "failed";

interface EditableHeader {
  grade: string;
  classNo: string;
  studentNo: string;
  name: string;
}

interface PreparedGroup {
  header: HeaderExtraction;
  pages: Array<{ name: string; dataUrl: string }>;
}

interface SaveSession {
  classFolderId: string;
  studentsFolderId: string;
}

function toEditable(header?: HeaderExtraction): EditableHeader {
  return {
    grade: header?.grade != null ? String(header.grade) : "",
    classNo: header?.classNo != null ? String(header.classNo) : "",
    studentNo: header?.studentNo != null ? String(header.studentNo) : "",
    name: header?.name ?? "",
  };
}

export default function UploadPage({
  params,
}: {
  params: { subjectId: string; assessmentId: string };
}) {
  const [step, setStep] = useState<Step>("select");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [headers, setHeaders] = useState<HeaderExtraction[]>([]);
  const [starts, setStarts] = useState<boolean[]>([]);
  const [info, setInfo] = useState<Record<number, EditableHeader>>({});
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [className, setClassName] = useState("1반");
  const [savingDrive, setSavingDrive] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});
  const [saveSession, setSaveSession] = useState<SaveSession | null>(null);

  const groups = useMemo(() => {
    const classifications = pages.map((page, index) => ({
      pageIndex: index,
      pageNumber: page.pageNumber,
      header: starts[index] ? headers[index] ?? { hasHeader: true } : { hasHeader: false },
    }));
    return deriveStudentGroups(classifications);
  }, [pages, headers, starts]);

  function infoFor(startIndex: number): EditableHeader {
    return info[startIndex] ?? toEditable(headers[startIndex]);
  }

  function patchInfo(startIndex: number, patch: Partial<EditableHeader>) {
    setInfo((prev) => ({
      ...prev,
      [startIndex]: { ...infoFor(startIndex), ...patch },
    }));
  }

  function buildPreparedGroups(): PreparedGroup[] {
    return groups.map((group) => {
      const editable = infoFor(group.startPageIndex);
      const header: HeaderExtraction = {
        hasHeader: true,
        grade: Number(editable.grade) || 0,
        classNo: Number(editable.classNo) || 0,
        studentNo: Number(editable.studentNo) || 0,
        name: editable.name,
      };
      return {
        header,
        pages: group.pageIndexes.map((pageIndex) => ({
          name: `page-${pages[pageIndex].pageNumber}.jpg`,
          dataUrl: pages[pageIndex].dataUrl,
        })),
      };
    });
  }

  async function ensureSaveSession(preparedGroups: PreparedGroup[]): Promise<SaveSession> {
    if (saveSession) return saveSession;
    const store = loadStore();
    const assessment = store.assessments.find((item) => item.id === params.assessmentId);
    if (!assessment) throw new Error("회차 정보를 찾을 수 없습니다.");

    const session = await createClassSession({
      subjectId: params.subjectId,
      assessmentFolderId: assessment.folderId,
      assessmentTitle: assessment.title,
      className,
      grade: preparedGroups[0]?.header.grade,
      classNo: preparedGroups[0]?.header.classNo,
    });

    const nextSession = {
      classFolderId: session.classFolder.id,
      studentsFolderId: session.studentsFolder.id,
    };
    setSaveSession(nextSession);

    const latest = loadStore();
    const existing = latest.classIndexes[params.assessmentId] ?? [];
    saveStore({
      ...latest,
      classIndexes: {
        ...latest.classIndexes,
        [params.assessmentId]: [session.classIndex, ...existing],
      },
    });

    return nextSession;
  }

  async function saveGroupIndexes(indexes: number[]): Promise<number> {
    const preparedGroups = buildPreparedGroups();
    const session = await ensureSaveSession(preparedGroups);
    let latestClassIndex = null;
    let failedCount = 0;

    for (const groupIndex of indexes) {
      setSaveStates((prev) => ({ ...prev, [groupIndex]: "saving" }));
      setSaveErrors((prev) => {
        const next = { ...prev };
        delete next[groupIndex];
        return next;
      });
      setSaveProgress(`학생 ${groupIndex + 1}/${preparedGroups.length} 저장 중`);
      try {
        const result = await saveClassStudent({
          classFolderId: session.classFolderId,
          studentsFolderId: session.studentsFolderId,
          ...preparedGroups[groupIndex],
        });
        if (result.classIndex) latestClassIndex = result.classIndex;
        setSaveStates((prev) => ({ ...prev, [groupIndex]: "saved" }));
      } catch (err) {
        failedCount += 1;
        setSaveStates((prev) => ({ ...prev, [groupIndex]: "failed" }));
        setSaveErrors((prev) => ({
          ...prev,
          [groupIndex]: err instanceof Error ? err.message : "저장 실패",
        }));
      }
    }

    if (latestClassIndex) {
      const latest = loadStore();
      const existing = latest.classIndexes[params.assessmentId] ?? [];
      saveStore({
        ...latest,
        classIndexes: {
          ...latest.classIndexes,
          [params.assessmentId]: [
            latestClassIndex,
            ...existing.filter((item) => item.folderId !== latestClassIndex?.folderId),
          ],
        },
      });
    }
    return failedCount;
  }

  async function handleFile(file: File) {
    setStep("processing");
    setError(null);
    setMessage(null);
    setSaveStates({});
    setSaveErrors({});
    setSaveSession(null);
    setSaveProgress("");
    setProgress("PDF를 페이지 이미지로 변환 중입니다.");
    try {
      const rendered = await renderPdfToImages(file);
      setPages(rendered);

      const nextHeaders: HeaderExtraction[] = [];
      for (let i = 0; i < rendered.length; i += 1) {
        setProgress(`머리글 분석 중입니다. ${i + 1}/${rendered.length}쪽`);
        try {
          const result = await classifyPage(dataUrlToBase64(rendered[i].dataUrl));
          nextHeaders.push(result);
        } catch {
          nextHeaders.push({ hasHeader: i === 0 });
        }
      }

      const nextStarts = nextHeaders.map((header, index) => index === 0 || header.hasHeader);
      const nextInfo: Record<number, EditableHeader> = {};
      nextStarts.forEach((isStart, index) => {
        if (isStart) nextInfo[index] = toEditable(nextHeaders[index]);
      });

      setHeaders(nextHeaders);
      setStarts(nextStarts);
      setInfo(nextInfo);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 처리에 실패했습니다.");
      setStep("select");
    }
  }

  async function saveToDrive() {
    setSavingDrive(true);
    setError(null);
    setMessage(null);
    try {
      setSaveStates({});
      setSaveErrors({});
      const failedCount = await saveGroupIndexes(groups.map((_, index) => index));
      setMessage(
        failedCount
          ? "일부 학생 저장에 실패했습니다. 실패 학생만 다시 저장할 수 있습니다."
          : "Drive에 반 폴더, 학생별 폴더, 페이지 이미지, class-index.json을 저장했습니다.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drive 저장 실패");
    } finally {
      setSavingDrive(false);
      setSaveProgress("");
    }
  }

  async function retryFailed() {
    const failedIndexes = groups
      .map((_, index) => index)
      .filter((index) => saveStates[index] === "failed");
    if (failedIndexes.length === 0) return;
    setSavingDrive(true);
    setError(null);
    setMessage(null);
    try {
      await saveGroupIndexes(failedIndexes);
      setMessage("실패 학생 재저장을 시도했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "재저장 실패");
    } finally {
      setSavingDrive(false);
      setSaveProgress("");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <AppHeader
        title="반별 PDF 업로드"
        backHref={`/subjects/${params.subjectId}/assessments`}
        backLabel="회차 목록"
      />

      {step === "select" && (
        <section className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-900">한 반 30명분 PDF를 업로드합니다.</p>
          <p className="mt-2 text-sm text-slate-500">
            각 학생 답안 상단의 학년, 반, 번호, 이름을 기준으로 자동 분류합니다.
          </p>
          <label className="mt-6 inline-flex cursor-pointer rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">
            PDF 선택
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </section>
      )}

      {step === "processing" && (
        <section className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-600">{progress}</p>
        </section>
      )}

      {step === "review" && (
        <section>
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            총 {pages.length}쪽을 {groups.length}명으로 분류했습니다. 잘못 나뉜 곳은 “새 학생 시작”을 조정하고,
            학생 정보를 확인하세요.
          </div>

          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              반 이름
              <input
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={() => void saveToDrive()}
              disabled={savingDrive}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {savingDrive ? "Drive 저장 중" : "이 반을 Drive에 저장"}
            </button>
            <button
              onClick={() => void retryFailed()}
              disabled={savingDrive || !Object.values(saveStates).some((state) => state === "failed")}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              실패 학생만 다시 저장
            </button>
          </div>

          {(message || error) && (
            <p className={`mb-4 text-sm ${error ? "text-red-600" : "text-green-700"}`}>
              {error || message}
            </p>
          )}
          {saveProgress && <p className="mb-4 text-sm text-slate-600">{saveProgress}</p>}

          <div className="space-y-5">
            {groups.map((group, groupIndex) => {
              const editable = infoFor(group.startPageIndex);
              return (
                <div key={group.startPageIndex} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900">
                      학생 {groupIndex + 1} · {group.pageIndexes.length}쪽
                    </h2>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        saveStates[groupIndex] === "saved"
                          ? "bg-green-50 text-green-700"
                          : saveStates[groupIndex] === "failed"
                            ? "bg-red-50 text-red-700"
                            : saveStates[groupIndex] === "saving"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-50 text-slate-500"
                      }`}
                    >
                      {saveStates[groupIndex] === "saved"
                        ? "저장 완료"
                        : saveStates[groupIndex] === "failed"
                          ? "저장 실패"
                          : saveStates[groupIndex] === "saving"
                            ? "저장 중"
                            : "대기"}
                    </span>
                  </div>
                  {saveErrors[groupIndex] && (
                    <p className="mb-3 text-sm text-red-600">{saveErrors[groupIndex]}</p>
                  )}

                  <div className="mb-4 grid gap-2 sm:grid-cols-4">
                    <input
                      value={editable.grade}
                      onChange={(event) => patchInfo(group.startPageIndex, { grade: event.target.value })}
                      placeholder="학년"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={editable.classNo}
                      onChange={(event) => patchInfo(group.startPageIndex, { classNo: event.target.value })}
                      placeholder="반"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={editable.studentNo}
                      onChange={(event) => patchInfo(group.startPageIndex, { studentNo: event.target.value })}
                      placeholder="번호"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={editable.name}
                      onChange={(event) => patchInfo(group.startPageIndex, { name: event.target.value })}
                      placeholder="이름"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {group.pageIndexes.map((pageIndex) => (
                      <div key={pageIndex} className="w-32">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pages[pageIndex].dataUrl}
                          alt={`${pageIndex + 1}쪽`}
                          className="h-44 w-32 rounded border border-slate-200 object-cover"
                        />
                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={starts[pageIndex]}
                            disabled={pageIndex === 0}
                            onChange={() => {
                              setStarts((prev) =>
                                prev.map((value, index) => (index === pageIndex ? !value : value)),
                              );
                            }}
                          />
                          새 학생 시작
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
