# GitHub + Vercel 배포 가이드

이 문서는 연수자가 자기 앱을 갖기 위한 배포 순서입니다.

## 1. GitHub Fork

1. 강사가 공유한 GitHub 저장소에 접속합니다.
2. `Fork`를 누릅니다.
3. 본인 GitHub 계정에 저장소를 복사합니다.

## 2. Vercel Import

1. Vercel에 로그인합니다.
2. `Add New Project`를 누릅니다.
3. Fork한 GitHub 저장소를 선택합니다.
4. Framework는 `Next.js`로 둡니다.
5. 아직 Deploy를 누르기 전에 환경변수를 입력합니다.

## 3. Gemini API 키

1. Google AI Studio에서 API 키를 만듭니다.
2. Vercel Environment Variables에 추가합니다.

```text
GEMINI_API_KEY=발급받은 키
GEMINI_MODEL=gemini-3.5-flash
```

텍스트 채점 모델은 평가 설정 화면에서 `Gemini 3.1 Flash-Lite`, `Gemini 3.5 Flash`, `Gemini 3.1 Pro` 중 선택할 수 있습니다. 선택하지 않으면 기본값으로 `Gemini 3.5 Flash`를 사용합니다.

## 4. Google Drive OAuth 설정

Google Drive에 폴더와 파일을 만들기 위해 OAuth 설정이 필요합니다.

1. Google Cloud Console에서 프로젝트를 만듭니다.
2. Google Drive API를 사용 설정합니다.
3. OAuth 동의 화면을 설정합니다.
4. OAuth 클라이언트 ID를 만듭니다.
5. 애플리케이션 유형은 `웹 애플리케이션`으로 선택합니다.

승인된 리디렉션 URI에는 아래 주소를 넣습니다.

```text
https://내프로젝트명.vercel.app/api/auth/callback/google
```

로컬에서 테스트할 경우에는 아래 주소도 추가합니다.

```text
http://localhost:3000/api/auth/callback/google
```

Vercel Environment Variables에 추가합니다.

```text
GOOGLE_CLIENT_ID=OAuth 클라이언트 ID
GOOGLE_CLIENT_SECRET=OAuth 클라이언트 보안 비밀번호
```

## 5. NextAuth 설정

`NEXTAUTH_SECRET`에는 긴 랜덤 문자열을 넣습니다.

예:

```text
NEXTAUTH_SECRET=아무도모르는아주긴랜덤문자열
```

`NEXTAUTH_URL`에는 배포된 앱 주소를 넣습니다.

```text
NEXTAUTH_URL=https://내프로젝트명.vercel.app
```

## 6. Deploy

환경변수를 모두 입력한 뒤 Vercel에서 Deploy를 누릅니다.

배포가 끝나면 앱 주소로 접속합니다.

## 7. 설정 점검

앱에서 `/setup`으로 이동합니다.

아래 항목이 모두 `설정됨`으로 표시되어야 합니다.

- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

## 8. Google Drive 연결

첫 화면에서 `Google Drive 연결`을 누릅니다.

연결 후 `Drive 폴더 만들기`를 누르면 교사 개인 Drive에 아래 폴더가 생깁니다.

```text
서논술형 채점 앱
```

## 문제 해결

Google 로그인이 실패하면 다음을 확인합니다.

- `NEXTAUTH_URL`이 실제 Vercel 주소와 같은지 확인
- Google Cloud OAuth 리디렉션 URI가 정확한지 확인
- Vercel 환경변수를 수정한 뒤 다시 Deploy 했는지 확인

AI 채점이 실패하면 다음을 확인합니다.

- `GEMINI_API_KEY`가 Vercel에 있는지 확인
- API 키가 올바른지 확인
- 모델 이름을 기본값 `gemini-3.5-flash` 또는 `gemini-3.1-flash-lite`로 되돌려 테스트
