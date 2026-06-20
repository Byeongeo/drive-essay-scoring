"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { loadDriveReport } from "@/lib/api";
import { loadStore } from "@/lib/client-store";
import type { ClassIndex, StudentIndexItem } from "@/lib/types";

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatStatus(student: StudentIndexItem) {
  return student.finalGrading || student.status === "final-saved" ? "채점 완료" : "검수";
}

function formatScoreDetails(student: StudentIndexItem) {
  const final = student.finalGrading;
  if (!final) return "";

  return final.scores
    .map((score) => {
      const maxScore = typeof score.maxScore === "number" ? `/${score.maxScore}` : "";
      const reason = score.reason ? ` - ${score.reason}` : "";
      return `${score.criterionName}: ${score.score}${maxScore}${reason}`;
    })
    .join("\n");
}

function formatConfirmedAt(student: StudentIndexItem) {
  const confirmedAt = student.finalGrading?.confirmedAt;
  if (!confirmedAt) return "";
  return new Date(confirmedAt).toLocaleString("ko-KR");
}

export default function ReportPage({
  params,
}: {
  params: { subjectId: string; assessmentId: string };
}) {
  const [classes, setClasses] = useState<ClassIndex[]>([]);
  const [assessmentTitle, setAssessmentTitle] = useState("평가 회차");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(false);

  useEffect(() => {
    let active = true;
    const store = loadStore();
    setClasses(store.classIndexes[params.assessmentId] ?? []);
    const assessment = store.assessments.find((item) => item.id === params.assessmentId);
    setAssessmentTitle(assessment?.title ?? "평가 회차");

    async function loadDrive() {
      if (!assessment?.folderId) return;
      setLoadingDrive(true);
      try {
        const driveClasses = await loadDriveReport(assessment.folderId);
        if (!active) return;
        // Drive에서 학생이 비어 보이면(옛 업로드로 데이터가 다른 폴더에 있는 경우) 로컬 데이터를
        // 빈 값으로 덮어쓰지 않는다 — 덮어쓰면 리포트가 "학생 0"이 된다.
        if (driveClasses.length > 0) {
          setClasses(driveClasses);
          setMessage("Drive에 저장된 최종 채점 결과를 반영했습니다.");
        }
      } catch {
        if (active) {
          setMessage("Drive 리포트를 불러오지 못해 브라우저 임시 데이터를 표시합니다.");
        }
      } finally {
        if (active) setLoadingDrive(false);
      }
    }

    void loadDrive();
    return () => {
      active = false;
    };
  }, [params.assessmentId]);

  const students = useMemo(
    () =>
      classes
        .flatMap((classIndex) => classIndex.students)
        .sort((a, b) => {
          if (a.grade !== b.grade) return a.grade - b.grade;
          if (a.classNo !== b.classNo) return a.classNo - b.classNo;
          return a.studentNo - b.studentNo;
        }),
    [classes],
  );

  const doneStudents = students.filter(
    (student) => student.finalGrading || student.status === "final-saved",
  );
  const average =
    doneStudents.length === 0
      ? 0
      : doneStudents.reduce(
          (sum, student) => sum + (student.finalGrading?.totalScore ?? student.totalScore ?? 0),
          0,
        ) / doneStudents.length;

  function exportCsv() {
    const rows = [
      [
        "학년",
        "반",
        "번호",
        "이름",
        "상태",
        "총점",
        "교사 최종 채점표",
        "교사 종합 채점 근거",
        "교사 최종 피드백",
        "확정 저장 시각",
      ],
      ...students.map((student) => {
        const final = student.finalGrading;
        return [
          String(student.grade),
          String(student.classNo),
          String(student.studentNo),
          student.name,
          formatStatus(student),
          final ? String(final.totalScore) : "",
          formatScoreDetails(student),
          final?.overallReason ?? "",
          final?.feedback ?? "",
          formatConfirmedAt(student),
        ];
      }),
    ];
    downloadCsv(`${assessmentTitle}-리포트.csv`, rows);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <AppHeader
        title={`${assessmentTitle} 리포트`}
        backHref={`/subjects/${params.subjectId}/assessments`}
        backLabel="회차 목록"
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">전체 학생</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{students.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">채점 완료</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{doneStudents.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">검수 필요</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {Math.max(0, students.length - doneStudents.length)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">평균</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{average.toFixed(1)}</p>
        </div>
      </section>

      {(message || loadingDrive) && (
        <p className="mt-4 text-sm text-slate-600">
          {loadingDrive ? "Drive 리포트를 불러오는 중입니다." : message}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          onClick={exportCsv}
          disabled={students.length === 0}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          CSV 다운로드
        </button>
      </div>

      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">학년</th>
              <th className="px-3 py-2 font-medium">반</th>
              <th className="px-3 py-2 font-medium">번호</th>
              <th className="px-3 py-2 font-medium">이름</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 text-right font-medium">총점</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  아직 리포트에 표시할 학생이 없습니다.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.folderId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{student.grade}</td>
                  <td className="px-3 py-2">{student.classNo}</td>
                  <td className="px-3 py-2">{student.studentNo}</td>
                  <td className="px-3 py-2">{student.name || "이름 없음"}</td>
                  <td className="px-3 py-2">{formatStatus(student)}</td>
                  <td className="px-3 py-2 text-right">
                    {student.finalGrading?.totalScore ?? student.totalScore ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
