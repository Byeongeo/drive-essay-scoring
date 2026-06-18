"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "접속 확인에 실패했습니다.");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "접속 확인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">앱 접속 비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          이 컴퓨터 기억하기 (개인 PC에서만 — 30일 동안 다시 묻지 않음)
          <span className="mt-0.5 block text-xs text-slate-400">
            체크하지 않으면 창을 닫을 때마다 비밀번호를 다시 입력합니다. 공용·학교 PC에서는 끄세요.
          </span>
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !password}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? "확인 중" : "들어가기"}
      </button>
    </form>
  );
}

export default function AccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-brand-700">Drive Essay Scoring</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">앱 접속 확인</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          이 앱은 개인용 채점 도구입니다. Vercel에 설정한 접속 비밀번호를 입력해야 사용할 수 있습니다.
        </p>
        <Suspense fallback={null}>
          <AccessForm />
        </Suspense>
      </section>
    </main>
  );
}
