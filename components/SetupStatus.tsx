"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";

export default function SetupStatus() {
  const { data: session, status } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createRoot() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/setup/drive-root", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Drive 폴더 생성 실패");
      setMessage(`Drive 폴더 생성 완료: ${data.root.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Drive 폴더 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Google Drive 연결</h2>
          <p className="mt-1 text-sm text-slate-500">
            Firebase 대신 교사 개인 Drive에 폴더와 채점 결과를 저장합니다.
          </p>
        </div>
        <div className="flex gap-2">
          {status === "authenticated" ? (
            <>
              <button
                onClick={() => void createRoot()}
                disabled={busy}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Drive 폴더 만들기
              </button>
              <button
                onClick={() => void signOut()}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                연결 해제
              </button>
            </>
          ) : (
            <button
              onClick={() => void signIn("google")}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Google Drive 연결
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {status === "loading" && "연결 상태 확인 중"}
        {status === "authenticated" && `${session?.user?.email || "Google 계정"} 연결됨`}
        {status === "unauthenticated" && "아직 Drive가 연결되지 않았습니다."}
      </div>
      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
    </section>
  );
}
