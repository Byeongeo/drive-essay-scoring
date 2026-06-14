"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

interface Health {
  gemini: boolean;
  googleClientId: boolean;
  googleClientSecret: boolean;
  nextAuthSecret: boolean;
  nextAuthUrl: string | null;
  model: string;
}

function StatusRow({
  label,
  ok,
  help,
}: {
  label: string;
  ok: boolean;
  help: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-slate-100 px-4 py-3">
      <div>
        <p className="font-medium text-slate-900">{label}</p>
        <p className="mt-1 text-sm text-slate-500">{help}</p>
      </div>
      <span
        className={`rounded-md px-2 py-1 text-xs font-semibold ${
          ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}
      >
        {ok ? "설정됨" : "필요"}
      </span>
    </div>
  );
}

export default function SetupPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "설정 상태 확인 실패");
        setHealth(data as Health);
      } catch (err) {
        setError(err instanceof Error ? err.message : "설정 상태 확인 실패");
      }
    }
    void load();
  }, []);

  const allOk = health
    ? health.gemini &&
      health.googleClientId &&
      health.googleClientSecret &&
      health.nextAuthSecret &&
      Boolean(health.nextAuthUrl)
    : false;

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <AppHeader title="설정 점검" backHref="/" backLabel="처음 화면" />

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="p-5">
          <h2 className="text-base font-semibold text-slate-900">환경변수 상태</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vercel 배포 후 앱이 동작하지 않을 때 이 화면에서 빠진 값을 먼저 확인합니다.
          </p>
        </div>

        {error && <p className="px-5 pb-5 text-sm text-red-600">{error}</p>}
        {!health && !error && <p className="px-5 pb-5 text-sm text-slate-500">확인 중</p>}

        {health && (
          <>
            <StatusRow
              label="GEMINI_API_KEY"
              ok={health.gemini}
              help="AI OCR, 루브릭 추출, 채점에 필요합니다."
            />
            <StatusRow
              label="GOOGLE_CLIENT_ID"
              ok={health.googleClientId}
              help="Google Drive 연결에 필요합니다."
            />
            <StatusRow
              label="GOOGLE_CLIENT_SECRET"
              ok={health.googleClientSecret}
              help="Google Drive 연결에 필요합니다."
            />
            <StatusRow
              label="NEXTAUTH_SECRET"
              ok={health.nextAuthSecret}
              help="로그인 세션 보호용 랜덤 비밀값입니다."
            />
            <StatusRow
              label="NEXTAUTH_URL"
              ok={Boolean(health.nextAuthUrl)}
              help={health.nextAuthUrl || "로컬은 http://localhost:3000, 배포 후에는 Vercel 주소를 넣습니다."}
            />
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="font-medium text-slate-900">기본 Gemini 모델</p>
              <p className="mt-1 text-sm text-slate-500">
                OCR, 루브릭 추출, 이미지 포함 채점에는 {health.model}을 사용합니다.
                텍스트 채점은 평가 설정 화면에서 따로 선택할 수 있습니다.
              </p>
            </div>
          </>
        )}
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">
          {allOk ? "기본 설정이 완료되었습니다." : "아직 필요한 설정이 있습니다."}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Google Drive 연결이 실패하면 Google Cloud OAuth의 승인된 리디렉션 URI에
          <span className="font-medium text-slate-900"> /api/auth/callback/google </span>
          주소가 포함되어 있는지 확인하세요.
        </p>
        <Link
          href="/subjects"
          className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          과목 화면으로 이동
        </Link>
        <Link
          href="/setup/guide"
          className="ml-2 mt-4 inline-block rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          배포 가이드 보기
        </Link>
      </section>
    </main>
  );
}
