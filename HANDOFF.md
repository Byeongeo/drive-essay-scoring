# HANDOFF — 이어서 작업하기 위한 인수인계

> 다른 PC/세션에서 이 프로젝트를 이어 작업할 때 **이 파일을 먼저 읽으세요.**
> 작성 갱신: 2026-06-18

---

## 0. 한눈에 보기

- **무엇**: 교사용 서논술형 자동 채점 웹앱. **Firebase 대신 Google Drive**에 데이터 저장(교사 개인 Drive). 학생 로그인 없음.
- **형제 프로젝트**: `Essay-scoring`(Firebase판). 이 앱은 그 **Google Drive판**이며 기능 동등을 지향.
- **GitHub**: `https://github.com/Byeongeo/drive-essay-scoring` (브랜치 `main`)
- **배포(Vercel)**: `https://drive-essay-scoring.vercel.app` — **`main`에 push하면 자동 재배포**.
- **스택**: Next.js 14 (App Router) · TypeScript · Tailwind · NextAuth(Google) · `@google/genai`(Gemini) · `pdfjs-dist`.

## 1. 지금까지 한 일 (최근 작업 순)

1. **채점화면 크래시 수정 + OCR/Gemini 강화** (Firebase판에서 이식)
   - 긴 한글 OCR을 큰 `<textarea>` 에 넣으면 크롬 탭이 죽음 → **읽기 div + 구간별 인라인 편집**(`components/`가 아니라 `grade/page.tsx` 내부에 구현).
   - 답안 이미지: 파일 API가 **세션 쿠키 인증**이라 `next/image` 최적화를 못 씀 → **클라이언트 canvas 로 축소**(object URL, 학생/페이지 전환 시 해제).
   - `lib/pdf.ts`: PDF 렌더 긴 변 `maxEdge` 상한(메모리 OOM 방지).
   - `lib/gemini.ts`: `withRetry`(429/5xx 지수 백오프) 전 호출 적용 · OCR 프롬프트 **원문 보존·추측 금지(****)** · OCR `maxOutputTokens=8192`.
2. **첨부 Ctrl+V 붙여넣기**: `components/PasteZone.tsx`(공용) — 문제/채점기준표(`edit/page.tsx`)·예시답안(`ExamplesEditor.tsx`)에 캡처/이미지/PDF 붙여넣기.
3. **업로드에 반 단위 학년/반 입력**: 학생별 행은 번호/이름만. (이후 **'반 이름' 입력은 제거**, 폴더명은 `"{학년}학년 {반}반"` 자동 생성.)
4. **저장 시 OCR 함께 실행 옵션**: 업로드 저장 루프에서 학생별 OCR→Drive 저장(체크박스, 기본 꺼짐, 순차).
5. **패스코드 세션화 + "이 컴퓨터 기억하기"**: `api/access/route.ts` 쿠키 기본 세션(창 닫으면 재입력), 체크 시 30일.
6. **설치 가이드 전면 보강**(`DEPLOYMENT_GUIDE.md`) + 이 `HANDOFF.md` 작성.

> 정확한 커밋 SHA는 `git log --oneline` 로 확인. (예: 크래시수정 `d19a42a`, 기능묶음 `bb73d30` …)

## 2. ⚠️ 반드시 알아야 할 함정 (반복 실수 방지)

1. **저장소가 Private이면 Vercel 배포가 "Blocked"** 됨 → 화면이 안 바뀜.
   - 해결: GitHub repo를 **Public** 으로(코드에 비밀 없음 — `.env.local`은 gitignore, 커밋된 건 빈 `.env.example`뿐), 또는 Vercel에 그 repo 접근 권한 부여 후 **Redeploy**.
   - 증상 진단: Vercel **Deployments** 탭에서 내 커밋이 `Blocked`(빨강)인지, Production Source가 옛 커밋에 머물러 있는지 확인.
2. **긴 한글을 편집 요소(`<textarea>`/contentEditable)에 렌더하면 크롬 탭이 죽는다.** 읽기 `<div>`는 안전.
   - → 길어질 수 있는 한글(OCR 등)은 **절대 textarea 한 칸에 통째로 넣지 말 것.** 구간 분할 편집 패턴 유지(`grade/page.tsx`의 `chunkText`/`EDIT_CHUNK`).
3. **패스코드 세션화는 의도된 결정**(학생 개인정보·공용 PC 대비). 무심코 다시 30일 고정으로 되돌리지 말 것. (구글 로그인은 30일 유지 — 앞단 패스코드 게이트가 보호.)
4. **Drive 파일 API(`/api/drive/file/[fileId]`)는 세션 쿠키 인증** → 서버 측 `next/image` 최적화 fetch는 쿠키가 없어 401. 표시용 축소가 필요하면 **클라이언트 canvas** 로.
5. 이 작업 샌드박스에선 **라이브 URL로의 curl이 막힘**(status 000)이고, 연결된 Vercel MCP 계정엔 이 프로젝트가 없음 → 배포 확인은 **사용자가 Vercel 대시보드**에서 해야 함.

## 3. 다른 데스크톱에서 이어서 시작하기

```bash
git clone https://github.com/Byeongeo/drive-essay-scoring.git
cd drive-essay-scoring
npm install
# 로컬 실행하려면 .env.local 필요(아래). 키 없이도 빌드/타입체크는 됨.
npm run dev        # http://localhost:3000
npm run typecheck  # 타입 검사
npm run build      # 배포 전 검증
```

수정 후 `git push origin main` 하면 **Vercel이 자동 배포**(repo가 Public인 한).

### `.env.local` (로컬 실행용 — 절대 커밋 금지)
```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
APP_ACCESS_PASSWORD=
```
로컬 구글 로그인 테스트하려면 Google OAuth 리디렉션에 `http://localhost:3000/api/auth/callback/google` 필요.

## 4. 핵심 파일 지도

```
app/access/page.tsx                  접속 비밀번호 화면("이 컴퓨터 기억하기" 체크박스)
app/api/access/route.ts              패스코드 쿠키 설정(기본 세션, remember 시 30일)
middleware.ts                        패스코드 게이트(모든 경로 앞단)
app/api/auth/[...nextauth]/route.ts  NextAuth(Google) — lib/auth.ts
app/subjects/.../edit/page.tsx       회차 설정·문제/기준표 첨부·루브릭·예시답안
app/subjects/.../upload/page.tsx     반별 PDF 업로드·자동분류·Drive 저장(학년/반·OCR옵션)
app/subjects/.../grade/page.tsx      채점화면(원본 이미지 축소표시 + 구간 인라인 OCR 편집)
app/subjects/.../report/page.tsx     리포트·CSV
app/api/drive/*                      Drive CRUD(과목/회차/반/학생/OCR·채점 저장)
lib/drive.ts                         Google Drive 파일·폴더·JSON 로직(server-only)
lib/gemini.ts                        Gemini 호출(머리글/OCR/채점) + withRetry
lib/pdf.ts                           PDF→이미지 렌더(maxEdge 상한)
lib/api.ts                           클라이언트 API 래퍼
components/PasteZone.tsx             공용 Ctrl+V 붙여넣기 영역
components/ExamplesEditor.tsx        예시답안 편집·첨부
```

## 5. 다음에 하면 좋은 것 (선택)

- 랜딩 데모 `components/GradingEditorPreview.tsx` 가 옛 "큰 편집창" 흐름을 보여줘 실제(구간 편집)와 어긋남 → 갱신.
- `PROJECT_PLAN.md` UI 원칙이 옛 "큰 편집창" 으로 적혀 있음 → 현행(구간 편집)으로 정정.
- 리포트 엑셀(xlsx) 내보내기, 학생별 채점 이력, 다음/이전 학생 이동 버튼, Storage 고아 이미지 정리.
- 연수용 샘플 평가·답안 포함.

## 6. 검증 방법

- 코드 변경 후 `npm run typecheck` + `npm run build` 통과 확인.
- 라이브 동작은 배포 후 **본인 구글 로그인 + 실제 답안**으로 확인(샌드박스에선 인증 흐름까지 못 감).
