"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { createDriveSubject, deleteDriveSubject, listDriveSubjects } from "@/lib/api";
import { loadStore, makeId, saveStore, type DraftSubject } from "@/lib/client-store";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<DraftSubject[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const localSubjects = loadStore().subjects;
      setSubjects(localSubjects);
      try {
        const driveSubjects = await listDriveSubjects();
        if (!active) return;
        const next = driveSubjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          folderId: subject.folderId,
          createdAt: subject.createdAt,
        }));
        const store = loadStore();
        saveStore({ ...store, subjects: next });
        setSubjects(next);
        setMessage("Drive에서 과목 목록을 불러왔습니다.");
      } catch {
        if (localSubjects.length) setMessage("Drive 연결 전이라 브라우저 임시 목록을 보여줍니다.");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function addSubject() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const store = loadStore();
    let subject: DraftSubject = {
      id: makeId("subject"),
      name: trimmed,
      createdAt: Date.now(),
    };
    try {
      const driveSubject = await createDriveSubject(trimmed);
      subject = {
        id: driveSubject.id,
        name: driveSubject.name,
        folderId: driveSubject.folderId,
        createdAt: driveSubject.createdAt,
      };
      setMessage("Drive에도 과목 폴더를 만들었습니다.");
    } catch {
      setMessage("Drive 연결 전이라 브라우저에 임시 저장했습니다.");
    }
    const next = [subject, ...store.subjects];
    saveStore({ ...store, subjects: next });
    setSubjects(next);
    setName("");
  }

  async function handleDeleteSubject(subject: DraftSubject) {
    const ok = window.confirm(
      `'${subject.name}' 과목을 삭제할까요?\n\n이 과목의 모든 회차·반·학생·채점 데이터가 함께 삭제됩니다.\n(구글 드라이브 휴지통으로 이동 — 30일 내 드라이브에서 복원 가능)`,
    );
    if (!ok) return;
    setDeletingId(subject.id);
    setMessage(null);
    if (subject.folderId) {
      try {
        await deleteDriveSubject(subject.id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "과목 삭제 실패");
        setDeletingId(null);
        return;
      }
    }
    // 로컬 스토어에서도 과목 + 그 과목의 회차/루브릭/예시/반 인덱스를 정리한다.
    const store = loadStore();
    const removedAssessmentIds = store.assessments
      .filter((item) => item.subjectId === subject.id)
      .map((item) => item.id);
    const nextRubrics = { ...store.rubrics };
    const nextExamples = { ...store.examples };
    const nextClassIndexes = { ...store.classIndexes };
    for (const aid of removedAssessmentIds) {
      delete nextRubrics[aid];
      delete nextExamples[aid];
      delete nextClassIndexes[aid];
    }
    const nextSubjects = store.subjects.filter((item) => item.id !== subject.id);
    saveStore({
      ...store,
      subjects: nextSubjects,
      assessments: store.assessments.filter((item) => item.subjectId !== subject.id),
      rubrics: nextRubrics,
      examples: nextExamples,
      classIndexes: nextClassIndexes,
    });
    setSubjects(nextSubjects);
    setDeletingId(null);
    setMessage("과목을 삭제했습니다.");
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <AppHeader title="과목" backHref="/" backLabel="처음 화면" />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <label className="block text-sm font-medium text-slate-700">과목 이름</label>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addSubject();
            }}
            placeholder="예: 과학, 수학, 국어"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void addSubject()}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            추가
          </button>
        </div>
      </section>

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}

      <section className="mt-5 grid gap-3">
        {subjects.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            아직 과목이 없습니다.
          </p>
        ) : (
          subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5"
            >
              <Link
                href={`/subjects/${subject.id}/assessments`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <div className="font-semibold text-slate-950">{subject.name}</div>
                <div className="mt-1 text-sm text-slate-500">평가 회차 관리</div>
              </Link>
              <button
                onClick={() => void handleDeleteSubject(subject)}
                disabled={deletingId === subject.id}
                className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingId === subject.id ? "삭제 중" : "삭제"}
              </button>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
