import Link from "next/link";
import AppHeader from "@/components/AppHeader";

const steps = [
  {
    title: "GitHub 저장소 Fork",
    body: "강사가 제공한 원본 저장소를 본인 GitHub 계정으로 Fork합니다.",
  },
  {
    title: "Vercel Import",
    body: "Vercel에서 Fork한 저장소를 Import합니다. Framework는 Next.js로 자동 인식됩니다.",
  },
  {
    title: "Gemini API 키",
    body: "Google AI Studio에서 GEMINI_API_KEY를 발급받아 Vercel Environment Variables에 입력합니다.",
  },
  {
    title: "Google Drive API 사용 설정",
    body: "Google Cloud Console에서 프로젝트를 만들고 Google Drive API를 사용 설정합니다.",
  },
  {
    title: "OAuth 클라이언트 생성",
    body: "웹 애플리케이션 OAuth 클라이언트를 만들고 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET을 Vercel에 입력합니다.",
  },
  {
    title: "리디렉션 URI 등록",
    body: "승인된 리디렉션 URI에 https://내프로젝트.vercel.app/api/auth/callback/google 을 등록합니다.",
  },
  {
    title: "NEXTAUTH 설정",
    body: "NEXTAUTH_SECRET에는 긴 랜덤 문자열을 넣고, NEXTAUTH_URL에는 Vercel 앱 주소를 넣습니다.",
  },
  {
    title: "설정 점검",
    body: "배포 후 /setup 화면에서 빠진 환경변수가 없는지 확인합니다.",
  },
];

export default function SetupGuidePage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <AppHeader title="연수자 배포 가이드" backHref="/setup" backLabel="설정 점검" />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">필요한 환경변수</h2>
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["GEMINI_API_KEY", "AI 채점과 OCR/이미지 해석"],
                ["GOOGLE_CLIENT_ID", "Google Drive 연결"],
                ["GOOGLE_CLIENT_SECRET", "Google Drive 연결"],
                ["NEXTAUTH_SECRET", "로그인 세션 보호"],
                ["NEXTAUTH_URL", "배포된 앱 주소"],
              ].map(([key, desc]) => (
                <tr key={key} className="border-t border-slate-100 first:border-t-0">
                  <td className="w-56 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900">
                    {key}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">{step.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <p className="font-semibold">주의</p>
        <p className="mt-1">
          Vercel 배포 주소가 바뀌면 Google Cloud OAuth 리디렉션 URI와 NEXTAUTH_URL도 같은 주소로 맞춰야 합니다.
        </p>
      </section>

      <Link
        href="/subjects"
        className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        과목 화면으로 이동
      </Link>
    </main>
  );
}
