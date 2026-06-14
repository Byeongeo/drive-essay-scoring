"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { listDriveAssessments } from "@/lib/api";
import { loadStore, makeId, saveStore, type DraftAssessment, type DraftSubject } from "@/lib/client-store";

export default function AssessmentsPage({
  params,
}: {
  params: { subjectId: string };
}) {
  const [subject, setSubject] = useState<DraftSubject | null>(null);
  const [assessments, setAssessments] = useState<DraftAssessment[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const store = loadStore();
    setSubject(store.subjects.find((item) => item.id === params.subjectId) ?? null);
    setAssessments(store.assessments.filter((item) => item.subjectId === params.subjectId));
    async function loadDrive() {
      try {
        const driveAssessments = await listDriveAssessments(params.subjectId);
        if (!active) return;
        const local = loadStore();
        const otherAssessments = local.assessments.filter(
          (item) => item.subjectId !== params.subjectId,
        );
        const nextAssessments: DraftAssessment[] = driveAssessments.map((item) => ({
          id: item.id,
          subjectId: params.subjectId,
          title: item.title,
          date: item.date,
          folderId: item.folderId,
          systemPrompt: "",
          rubricSource: "structured",
          gradingModel: "",
          gradingMode: "text-only",
          createdAt: item.createdAt,
        }));
        saveStore({ ...local, assessments: [...nextAssessments, ...otherAssessments] });
        setAssessments(nextAssessments);
        if (nextAssessments.length) setMessage("Drive에서 회차 목록을 불러왔습니다.");
      } catch {
        setMessage("Drive 연결 전이면 브라우저 임시 회차 목록을 사용합니다.");
      }
    }
    void loadDrive();
    return () => {
      active = false;
    };
  }, [params.subjectId]);

  const title = useMemo(() => subject?.name || "과목", [subject]);

  function addAssessment() {
    const store = loadStore();
    const count = store.assessments.filter((item) => item.subjectId === params.subjectId).length + 1;
    const assessment: DraftAssessment = {
      id: makeId("assessment"),
      subjectId: params.subjectId,
      title: `서논술형 평가 ${count}회`,
      date: Date.now(),
      systemPrompt: "",
      rubricSource: "structured",
      gradingModel: "",
      gradingMode: "text-only",
      createdAt: Date.now(),
    };
    const nextAssessments = [assessment, ...store.assessments];
    saveStore({ ...store, assessments: nextAssessments, rubrics: { ...store.rubrics, [assessment.id]: { criteria: [] } } });
    setAssessments(nextAssessments.filter((item) => item.subjectId === params.subjectId));
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <AppHeader title={`${title} 평가 회차`} backHref="/subjects" backLabel="과목 목록" />

      <div className="mb-5 flex justify-end">
        <button
          onClick={addAssessment}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          새 회차 만들기
        </button>
      </div>
      {message && <p className="mb-4 text-sm text-slate-600">{message}</p>}

      <section className="grid gap-3">
        {assessments.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            아직 평가 회차가 없습니다.
          </p>
        ) : (
          assessments.map((assessment) => (
            <div key={assessment.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-950">{assessment.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    텍스트 모델 {assessment.gradingModel || "환경변수 기본 모델"} · {new Date(assessment.date).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/subjects/${params.subjectId}/assessments/${assessment.id}/edit`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    회차 설정
                  </Link>
                  <Link
                    href={`/subjects/${params.subjectId}/assessments/${assessment.id}/upload`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    PDF 업로드
                  </Link>
                  <Link
                    href={`/subjects/${params.subjectId}/assessments/${assessment.id}/grade`}
                    className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    채점
                  </Link>
                  <Link
                    href={`/subjects/${params.subjectId}/assessments/${assessment.id}/report`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    리포트
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
