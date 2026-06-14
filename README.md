# Drive Essay Scoring

Google Drive를 데이터 저장소로 사용하는 교사용 서논술형 채점 앱입니다.

연수 흐름은 하나의 코드로 운영합니다.

1. 강사가 이 저장소를 GitHub에 올리고 Vercel에 배포합니다.
2. 연수 초반에는 강사 앱으로 결과를 시연합니다.
3. 이후 연수자는 이 저장소를 Fork합니다.
4. 연수자는 Vercel에서 자기 저장소를 Import하고 환경변수를 입력합니다.
5. 연수자는 자기 앱에서 Google Drive를 연결하고 개인 Drive에 데이터를 저장합니다.

## 기술 방향

- Next.js App Router
- Google Gemini API
- Google Drive API
- Firebase 미사용
- 학생 로그인 미사용
- 교사 개인 Google Drive에 과목, 회차, 반, 학생별 폴더와 JSON 결과 저장

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
APP_ACCESS_PASSWORD=
```

`APP_ACCESS_PASSWORD`를 설정하면 앱 첫 화면 전에 비밀번호 입력 화면이 먼저 열립니다. 개인 Vercel 주소가 외부에 알려져도 이 비밀번호를 모르면 앱 화면과 AI API를 사용할 수 없습니다.

`GEMINI_MODEL`은 OCR, 루브릭 추출, 이미지 포함 채점에 쓰는 기본 모델입니다. 텍스트 채점 모델은 평가 설정 화면에서 `Gemini 3.1 Flash-Lite`, `Gemini 3.5 Flash`, `Gemini 3.1 Pro` 중 선택합니다.

Vercel 배포 후 `NEXTAUTH_URL`은 배포 주소로 바꿉니다.

```text
NEXTAUTH_URL=https://내프로젝트명.vercel.app
```

자세한 배포 순서는 [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)를 봅니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## Drive 저장 구조

```text
서논술형 채점 앱/
  app-index.json
  과학/
    subject.json
    서논술형 평가 1회/
      assessment.json
      rubric.json
      prompt.json
      examples/
      1반/
        class-index.json
        original-upload.pdf
        students/
          1학년_1반_01번_홍길동/
            pages/
            ocr-draft.json
            ocr-confirmed.json
            ai-grading.json
            final-grading.json
```

## 중요한 설계 원칙

- Drive 폴더를 매번 검색하지 않고 `class-index.json`과 `app-index.json`을 우선 읽습니다.
- AI 채점 결과와 교사 최종 결과를 따로 저장합니다.
- 루브릭이 없으면 시스템 프롬프트에서 임시 루브릭을 추출하고, 교사가 확인한 뒤 채점합니다.
- OCR/이미지 해석에서 불명확한 부분은 `****`로 표시하고 교사가 확정합니다.

## 현재 구현 상태

- 과목, 평가 회차, 루브릭, 예시답안 화면이 있습니다.
- Google Drive 연결 후 과목 폴더와 `subject.json`을 만들 수 있습니다.
- 회차 설정 저장 시 `assessment.json`, `rubric.json`, `examples.json`을 Drive에 만들 수 있습니다.
- PDF 업로드 후 페이지별 머리글을 분석하고 학생별 분류를 확인할 수 있습니다.
- 분류 확인 후 Drive에 반 폴더, 학생 폴더, 페이지 이미지, `student.json`, `class-index.json`을 저장하는 초안 API가 있습니다.
- 채점 화면은 AI 점수, 근거, 피드백 전체를 큰 편집창으로 가져와 교사가 수정하는 흐름으로 구성되어 있습니다.
- Drive 연결 후 과목 목록과 회차 목록을 다시 불러올 수 있습니다.
- 회차 설정을 수정하면 기존 Drive JSON 파일도 수정 저장합니다.
- 학생 선택 후 `ai-grading.json`, `final-grading.json`을 Drive 학생 폴더에 저장할 수 있습니다.
- Drive에 저장된 반 목록과 학생별 원본 페이지를 채점 화면에서 다시 불러올 수 있습니다.
- 채점 화면에서 `ocr-draft.json`, `ocr-confirmed.json`을 저장할 수 있습니다.
- 채점 방식은 `텍스트 기반`, `이미지 포함`, `자동 판단` 중 선택할 수 있습니다.
- 기본은 비용이 낮은 텍스트 기반 채점이며, 수식/도형/그림/화학식이 감지되면 이미지 포함 채점을 권장합니다.
- 리포트 화면과 CSV 다운로드가 있습니다.
- 리포트는 Drive의 학생별 `final-grading.json`을 직접 읽어 총점을 반영합니다.
- 설정 점검 화면(`/setup`)에서 Vercel 환경변수 누락 여부를 확인할 수 있습니다.
- 연수자 배포 가이드 화면(`/setup/guide`)이 있습니다.
- 반별 PDF 저장은 한 반 전체를 한 번에 보내지 않고 학생별로 순차 저장합니다.
- 학생별 Drive 저장 상태를 표시하고, 실패한 학생만 다시 저장할 수 있습니다.

## 다음 구현 단계

- OAuth/Gemini 환경변수 설정 가이드에 스크린샷 추가
- 대용량 PDF 처리 취소/일시정지 UX 보강
- GitHub 업로드와 Vercel 배포 전 최종 점검
