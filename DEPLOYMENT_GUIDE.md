# 설치 가이드 — 처음부터 끝까지 따라하기

> **컴퓨터·코딩을 잘 몰라도 됩니다.** 순서대로 클릭만 하면 약 **30분**이면 내 전용 채점 앱이 생깁니다.
> 막히면 맨 아래 **[7. 자주 막히는 곳](#7-자주-막히는-곳-문제-해결)** 을 먼저 보세요.

---

## 0. 이 앱은 무엇이고, 무엇이 필요한가

학생들의 손글씨 서논술형 답안을 **사진/PDF로 올리면**, AI(Gemini)가 글자를 읽고(OCR) 채점 초안을 만들어 주고, 교사가 확인·수정해 **내 구글 드라이브에 저장**하는 웹앱입니다. (학생은 로그인하지 않습니다. 교사만 씁니다.)

### 준비물 (모두 무료)
- [ ] **구글 계정** (지메일) — AI 키 발급 + 드라이브 저장에 사용
- [ ] **GitHub 계정** — 앱 코드를 내 계정으로 복사(Fork)
- [ ] **Vercel 계정** — 앱을 인터넷 주소로 띄워줌 (GitHub로 가입)
- [ ] 약 30분

### 한 줄 용어
| 용어 | 쉽게 말하면 |
|------|------------|
| **GitHub** | 앱의 설계도(코드)를 보관하는 창고 |
| **Fork** | 그 창고를 **내 계정으로 복사**하는 것 |
| **Vercel** | 복사한 코드를 **진짜 웹사이트 주소로 띄워주는** 서비스 |
| **Gemini** | 글자를 읽고 채점하는 **AI 엔진** |
| **환경변수** | 앱에 넣어주는 **비밀 열쇠·설정값** (키, 주소, 비번 등) |

---

## 1. 앱을 내 GitHub로 복사(Fork)하기

1. 강사가 알려준 원본 저장소 주소(예: `https://github.com/Byeongeo/drive-essay-scoring`)에 접속합니다.
2. 로그인이 안 돼 있으면 GitHub에 **로그인/가입**합니다.
3. 오른쪽 위 **`Fork`** 버튼을 누르고 → **`Create fork`** 를 누릅니다.
4. 잠시 뒤 **내 계정 아래에 같은 저장소**가 생깁니다. (주소가 `github.com/내아이디/drive-essay-scoring` 로 바뀜)

> ### ⚠️ 가장 중요 — 저장소는 **Public(공개)** 으로 두세요
> Fork한 저장소가 **Private(비공개)** 이면 **Vercel 배포가 "Blocked"(차단)** 되어 앱이 안 올라갑니다. (실제로 자주 겪는 문제입니다.)
> - 이 앱 코드에는 **비밀번호·API 키가 들어있지 않습니다**(그건 전부 4단계의 "환경변수"로 따로 넣습니다). 그래서 **공개해도 안전**합니다.
> - 혹시 Private으로 만들었다면: 저장소 → **Settings → General → 맨 아래 Danger Zone → Change repository visibility → Public** 으로 바꾸세요.

---

## 2. Gemini API 키 발급받기 (AI 채점용)

1. **[Google AI Studio](https://aistudio.google.com/app/apikey)** 에 구글 계정으로 접속합니다.
2. **`Create API key`(API 키 만들기)** 를 누릅니다.
3. 생긴 키(예: `AIza...` 로 시작하는 긴 문자열)를 **복사**해서 메모장에 잠깐 붙여둡니다.
   - 이 키는 4단계에서 `GEMINI_API_KEY` 칸에 넣습니다.
   - **남에게 보여주지 마세요.** (키가 있으면 남이 내 비용으로 AI를 씁니다.)

---

## 3. 구글 로그인/드라이브 연결 설정 (가장 까다로운 부분 — 천천히)

이 앱이 **내 구글 드라이브에 폴더·파일을 만들려면** 구글의 허락(OAuth)이 필요합니다.

1. **[Google Cloud Console](https://console.cloud.google.com/)** 에 접속합니다.
2. 상단의 프로젝트 선택 → **`새 프로젝트`** → 이름 아무거나(예: `essay-scoring`) → 만들기.
3. 왼쪽 메뉴 **`API 및 서비스` → `라이브러리`** → **`Google Drive API`** 검색 → **`사용 설정`**.
4. **`API 및 서비스` → `OAuth 동의 화면`**:
   - User Type: **외부(External)** 선택 → 만들기
   - 앱 이름, 사용자 지원 이메일(내 이메일), 개발자 연락처(내 이메일)만 채우고 저장하며 계속.
   - **`테스트 사용자(Test users)`** 단계에서 **내 구글 이메일을 추가**합니다. (이걸 빠뜨리면 로그인 시 "액세스 차단됨" 에러)
5. **`API 및 서비스` → `사용자 인증 정보(Credentials)` → `사용자 인증 정보 만들기` → `OAuth 클라이언트 ID`**:
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 리디렉션 URI** 에 아래 두 개를 추가합니다. *(배포 주소는 4단계에서 정해지므로, 일단 localhost만 넣고 5단계에서 실제 주소를 다시 추가해도 됩니다.)*
     ```
     http://localhost:3000/api/auth/callback/google
     https://내프로젝트명.vercel.app/api/auth/callback/google
     ```
   - 만들면 **클라이언트 ID** 와 **클라이언트 보안 비밀번호(Secret)** 가 나옵니다. 둘 다 **복사**해 메모장에 둡니다.
     - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 칸에 넣을 값입니다.

---

## 4. Vercel에 올리기 (배포)

1. **[Vercel](https://vercel.com/)** 에 접속 → **`Continue with GitHub`** 로 가입/로그인.
2. **`Add New…` → `Project`** → 1단계에서 Fork한 **`drive-essay-scoring`** 저장소를 **`Import`**.
3. Framework는 자동으로 **Next.js** 로 잡힙니다. 그대로 둡니다.
4. **`Environment Variables`(환경변수)** 를 펼쳐 아래 값을 하나씩 넣습니다:

| 이름(Key) | 값(Value) | 어디서 얻나 |
|-----------|-----------|------------|
| `GEMINI_API_KEY` | `AIza...` | 2단계 |
| `GEMINI_MODEL` | `gemini-3.5-flash` | 그대로 입력 |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | 3단계 |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | 3단계 |
| `NEXTAUTH_SECRET` | 아무 긴 랜덤 문자열 | 아래 설명 |
| `NEXTAUTH_URL` | (일단 비워두거나 임시) | 5단계에서 채움 |
| `APP_ACCESS_PASSWORD` | 내가 정하는 접속 비밀번호 | 직접 정함 |

- **`NEXTAUTH_SECRET` 만드는 법**: 아무 길고 무작위한 문자열이면 됩니다. 예: 키보드를 마구 눌러 40자 이상, 또는 사이트 [generate-secret.vercel.app](https://generate-secret.vercel.app/32) 에서 복사.
- **`APP_ACCESS_PASSWORD`**: 앱에 들어갈 때 묻는 **접속 비밀번호**입니다. 내가 외울 수 있는 값으로 정하세요. (주소가 남에게 알려져도 이 비번을 모르면 못 들어옵니다.)
5. **`Deploy`** 를 누릅니다. 1~3분 기다립니다.

---

## 5. 배포 주소 받고 마무리 설정

1. 배포가 끝나면 **내 앱 주소**(예: `https://drive-essay-scoring-xxxx.vercel.app`)가 생깁니다.
2. Vercel → 프로젝트 → **`Settings` → `Environment Variables`** 에서 **`NEXTAUTH_URL`** 값을 **그 주소로** 채웁니다(맨 끝 `/` 없이).
   ```
   NEXTAUTH_URL=https://drive-essay-scoring-xxxx.vercel.app
   ```
3. 3단계의 Google Cloud **리디렉션 URI** 에도 그 주소 기준으로 추가했는지 확인합니다.
   ```
   https://drive-essay-scoring-xxxx.vercel.app/api/auth/callback/google
   ```
4. 환경변수를 바꿨으니 Vercel → **`Deployments` → 맨 위 배포 → `…` → `Redeploy`** 로 다시 배포합니다.

---

## 6. 처음 사용해보기

1. 내 앱 주소에 접속 → **접속 비밀번호**(`APP_ACCESS_PASSWORD`)를 입력.
   - **공용/학교 PC면 "이 컴퓨터 기억하기"를 체크하지 마세요.** (창을 닫으면 다시 비번을 물어 남이 못 보게 합니다.) 개인 PC면 체크하면 30일간 안 물어봅니다.
2. **`Google Drive 연결`** → 본인 구글 계정 로그인 → 권한 허용.
3. **`설정 점검`(/setup)** 에 들어가 `GEMINI_API_KEY` 등 항목이 모두 **`설정됨`** 인지 확인.
4. 실제 채점 흐름:
   - **과목/회차 만들기** → **문제·채점기준표 첨부**(파일 선택 **또는 캡처를 Ctrl+V로 붙여넣기**) → **루브릭/예시답안**(선택) →
   - **반별 PDF 업로드**(학년·반 입력 후 학생 PDF 올리기 → 자동 분류 확인 → Drive 저장. *"저장하면서 OCR 함께 실행"* 을 켜면 채점화면에서 OCR이 이미 끝나 있습니다) →
   - **채점**(원본과 OCR을 비교, 틀린 부분만 클릭해 고치고 AI 채점 → 최종 저장) →
   - **리포트**(반·회차별 집계, CSV 내려받기).

---

## 7. 자주 막히는 곳 (문제 해결)

| 증상 | 원인 / 해결 |
|------|------------|
| **배포가 "Blocked"(차단)** 되고 화면이 안 바뀜 | **저장소가 Private** 입니다. 1단계의 ⚠️대로 **Public** 으로 바꾸세요. (또는 Vercel에 그 repo 접근 권한 부여) 바꾼 뒤 **Redeploy**. |
| 구글 로그인 시 **"액세스 차단됨"** | 3-4단계의 **테스트 사용자에 내 이메일**을 안 넣었습니다. 추가하세요. |
| 로그인 후 **redirect_uri_mismatch** | `NEXTAUTH_URL` 과 Google **리디렉션 URI** 가 실제 배포 주소와 **정확히** 같아야 합니다(오타·끝의 `/` 주의). 고친 뒤 **Redeploy**. |
| **AI 채점/OCR 실패** | `GEMINI_API_KEY` 가 맞는지, `GEMINI_MODEL` 이 `gemini-3.5-flash`(또는 `gemini-3.1-flash-lite`)인지 확인. |
| 변경했는데 **화면이 그대로** | 브라우저 캐시 → **Ctrl+Shift+R**(강력 새로고침) 또는 시크릿 창. Vercel **Deployments** 가 **Ready** 인지 확인. |
| 학생이 많을 때 **업로드/채점이 느림** | 정상입니다. PDF 변환·AI 호출을 학생별로 순차 처리합니다. |

---

### 연수 운영(강사용) 한 줄 요약
강사가 원본 저장소 + 데모 앱을 준비 → 연수생이 **Fork → Vercel Import → 환경변수 입력 → 배포 → 자기 Drive 연결**. 각자 자기 앱·자기 드라이브라 데이터가 분리됩니다. 더 자세한 운영은 [TRAINING_GUIDE.md](TRAINING_GUIDE.md), 이어 작업·인수인계는 [HANDOFF.md](HANDOFF.md) 참고.
