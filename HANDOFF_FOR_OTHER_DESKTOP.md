# Drive Essay Scoring 작업 인수인계

작성일: 2026-06-14  
프로젝트 경로: `C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring`  
GitHub 저장소: `https://github.com/Byeongeo/drive-essay-scoring`  
현재 브랜치: `main`  
최근 커밋: `1a74344 Preserve completed statuses when saving grades`

## 프로젝트 개요

이 앱은 교사가 학생들의 수기 서논술형 답안을 PDF 또는 이미지로 업로드한 뒤, Google Drive에 학생별 폴더를 만들고 Gemini API로 OCR/해석 및 채점 초안을 생성하는 Next.js 앱입니다.

Firebase를 쓰지 않고 Google Drive를 저장소처럼 사용합니다. 학생은 접속하지 않고, 교사만 접속하여 과목, 평가 회차, 문제/채점기준표, 예시답안, 학생 답안을 관리합니다.

## 현재 구현된 주요 기능

- Google 로그인 및 Google Drive 연결
- 과목 생성
- 평가 회차 생성
- 문제 및 채점기준표 이미지/PDF 첨부
- 루브릭 직접 입력
- 시스템 프롬프트 입력
- 예시답안 텍스트 및 첨부파일 입력
- 학생 답안 PDF/이미지 업로드
- 학생 답안 상단의 학년, 반, 번호, 이름 기준 자동 분류
- 학생별 Google Drive 폴더 저장
- 원본 페이지 보기 및 확대/축소
- AI OCR/해석 실행
- 교사가 확인한 답안 저장
- 텍스트 기반 채점 / 이미지 포함 채점 / 자동 판단 모드
- AI 채점 실행
- 교사 최종 채점 수정 및 저장
- 학생 목록에서 완료/검수 표시
- 중복 학생 삭제
- 저장된 OCR, AI 채점, 교사 최종 채점 다시 불러오기
- 리포트 화면
- CSV 다운로드
- 최종 저장된 학생만 CSV에 교사 최종 점수, 채점 근거, 피드백 포함

## 최근 수정한 문제

1. `OCR 초안 저장`과 `OCR/해석 확정 저장` 버튼이 혼란스러워서 `확인한 답안 저장` 하나로 단순화했습니다.
2. `AI 결과 다시 반영` 버튼을 제거했습니다. AI 채점이 마음에 들지 않으면 `AI 채점 실행`을 다시 누르면 됩니다.
3. 리포트 화면에 갔다가 채점 화면으로 돌아왔을 때 완료 학생이 다시 `검수`로 보이는 문제를 고쳤습니다.
4. 한 학생을 최종 저장했을 때 다른 완료 학생의 상태가 `검수`로 되돌아가는 문제를 고쳤습니다.
5. 채점 화면 왼쪽 학생 목록에서 완료 학생은 `✓`, 미완료 학생은 `검수`로 표시합니다.
6. 리포트 CSV에 교사의 최종 채점 결과와 피드백이 들어가도록 개선했습니다.

## 중요한 파일

주요 화면:

- `app/subjects/[subjectId]/assessments/[assessmentId]/upload/page.tsx`
  - PDF/이미지 업로드 및 학생 분류 화면
- `app/subjects/[subjectId]/assessments/[assessmentId]/grade/page.tsx`
  - OCR 확인, AI 채점, 교사 최종 채점 화면
- `app/subjects/[subjectId]/assessments/[assessmentId]/report/page.tsx`
  - 리포트 및 CSV 다운로드 화면
- `app/subjects/[subjectId]/assessments/[assessmentId]/edit/page.tsx`
  - 평가 설정, 문제/채점기준표, 루브릭, 예시답안 관리 화면

주요 API:

- `app/api/drive/classes/route.ts`
  - Drive에 저장된 반/학생 목록 불러오기
  - 최종 채점 저장 여부까지 확인해서 완료 상태 복원
- `app/api/drive/student-work/route.ts`
  - 학생별 OCR, AI 채점, 최종 채점 저장/불러오기/삭제
- `app/api/drive/report/route.ts`
  - 리포트용 학생 목록과 최종 채점 결과 불러오기
- `app/api/drive/class-upload/route.ts`
  - 한 반 PDF/이미지 업로드 후 Drive 저장
- `app/api/drive/interpret-student/route.ts`
  - 학생 답안 OCR/이미지 해석
- `app/api/grade/route.ts`
  - AI 채점 실행

공통 로직:

- `lib/drive.ts`
  - Google Drive 파일/폴더/JSON 저장 로직
- `lib/gemini.ts`
  - Gemini API 호출, OCR/해석, 채점 프롬프트 구성
- `lib/types.ts`
  - 앱 전체 자료 구조
- `lib/api.ts`
  - 클라이언트에서 API 호출하는 함수
- `lib/client-store.ts`
  - 브라우저 임시 저장소 사용

문서:

- `README.md`
- `DEPLOYMENT_GUIDE.md`
- `TRAINING_GUIDE.md`
- `PROJECT_PLAN.md`
- `HANDOFF_FOR_OTHER_DESKTOP.md`

## 환경 변수

Vercel 환경 변수에는 다음 값이 필요합니다.

```env
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
APP_ACCESS_PASSWORD=
```

주의:

- `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `APP_ACCESS_PASSWORD`는 비밀값입니다.
- GitHub에 올리면 안 됩니다.
- USB로 옮길 때도 다른 사람에게 전달하지 않도록 주의해야 합니다.
- 로컬 개발용 `.env.local` 파일이 있다면 개인 보관용으로만 옮기세요.

## 다른 데스크톱에서 이어서 작업하는 방법

가장 권장하는 방법은 GitHub에서 다시 받는 것입니다.

```powershell
git clone https://github.com/Byeongeo/drive-essay-scoring.git
cd drive-essay-scoring
npm install
npm run dev
```

로컬 실행 주소:

```text
http://localhost:3000
```

로컬에서 Google 로그인을 테스트하려면 Google Cloud OAuth 클라이언트에 다음 URI가 필요합니다.

```text
http://localhost:3000/api/auth/callback/google
```

Vercel 배포 주소를 사용할 때는 Vercel 주소 기준으로 다음 URI가 필요합니다.

```text
https://배포주소/api/auth/callback/google
```

## USB에 담아갈 파일

### 가장 쉬운 방법

아래 폴더 전체를 USB에 복사합니다.

```text
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring
```

다만 다음 폴더는 용량이 크고 다시 만들 수 있으므로 USB에 꼭 넣지 않아도 됩니다.

```text
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\node_modules
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\.next
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\.npm-cache
```

다른 데스크톱에서는 `npm install`을 다시 실행하면 `node_modules`가 다시 만들어집니다.

### 꼭 챙겨야 하는 폴더와 파일

```text
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\app
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\components
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\lib
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\types
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\package.json
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\package-lock.json
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\next.config.mjs
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\tailwind.config.ts
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\postcss.config.mjs
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\tsconfig.json
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\vercel.json
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\.env.example
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\.gitignore
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\README.md
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\DEPLOYMENT_GUIDE.md
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\TRAINING_GUIDE.md
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\PROJECT_PLAN.md
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\HANDOFF_FOR_OTHER_DESKTOP.md
```

Git 기록까지 유지하려면 아래 폴더도 함께 복사합니다.

```text
C:\Users\USER\Documents\Essay-scoring-app-for-teacher\drive-essay-scoring\.git
```

## 다른 데스크톱에서 추가 작업 전 확인할 것

1. Node.js가 설치되어 있는지 확인합니다.
2. 프로젝트 폴더에서 `npm install`을 실행합니다.
3. `.env.local`을 새로 만들거나 기존 개인용 `.env.local`을 복사합니다.
4. `npm run typecheck`로 타입 오류를 확인합니다.
5. `npm run build`로 Vercel 배포 빌드가 되는지 확인합니다.
6. 수정 후 GitHub에 push하면 Vercel이 자동 배포합니다.

## 현재까지 검증한 명령

아래 명령은 최근 수정 후 통과했습니다.

```powershell
npm run typecheck
npm run build
```

## 앞으로 개선하면 좋은 부분

- 채점 기준표 이미지를 분석한 뒤 구조화된 루브릭으로 자동 변환하는 기능 강화
- 글자 수 기준처럼 엄격한 계산이 필요한 항목을 별도 규칙으로 처리
- 예시답안별로 어떤 채점 요소에 대한 예시인지 표시하는 UI 추가
- CSV 외에 엑셀 형식 다운로드 추가
- 학생별 채점 이력 보기 강화
- 한 반 전체를 순서대로 채점하는 다음/이전 학생 이동 버튼 추가
- 연수용 샘플 평가 자료와 샘플 답안 포함
