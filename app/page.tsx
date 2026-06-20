import SetupStatus from "@/components/SetupStatus";
import WorkflowSteps from "@/components/WorkflowSteps";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-brand-700">Drive Essay Scoring</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">
          Google Drive 기반 서논술형 채점 앱
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          강사는 이 앱으로 먼저 시연하고, 연수자는 같은 GitHub 저장소를 Fork해 자기 Vercel 앱으로 배포합니다.
          학생 답안과 채점 결과는 각 교사의 Google Drive에 저장됩니다.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <SetupStatus />
          <Link
            href="/subjects"
            className="block rounded-lg bg-slate-950 px-5 py-4 text-center text-sm font-semibold text-white hover:bg-slate-800"
          >
            과목과 평가 회차 만들기
          </Link>
          <Link
            href="/setup"
            className="block rounded-lg border border-slate-300 bg-white px-5 py-4 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            설정 점검
          </Link>
        </div>
        <WorkflowSteps />
      </div>
    </main>
  );
}
