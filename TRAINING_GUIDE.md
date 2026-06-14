# 연수 운영 가이드

## 1부: 강사 데모

강사는 미리 배포한 Vercel 앱으로 전체 흐름을 보여준다.

1. Google Drive 연결
2. Drive 루트 폴더 생성
3. 과목과 회차 생성
4. 루브릭 또는 시스템 프롬프트 입력
5. 한 반 30명 PDF 업로드
6. 학생 자동 분류 결과 확인
7. OCR, 수식, 도형, 그림 해석 확인
8. AI 채점 결과 전체 가져오기
9. 점수, 근거, 피드백을 교사가 수정
10. 최종 저장

## 2부: 연수자 개인 앱 만들기

연수자는 같은 원본 저장소를 자기 계정으로 Fork한다.

1. GitHub 계정 만들기
2. 원본 저장소 Fork
3. Vercel 계정 만들기
4. Vercel에서 Fork한 저장소 Import
5. Gemini API 키 만들기
6. Google Cloud에서 Drive API와 OAuth 클라이언트 만들기
7. Vercel 환경변수 입력
8. Deploy
9. 자기 앱 주소 접속
10. 자기 Google Drive 연결

## 교사가 입력해야 하는 환경변수

```text
GEMINI_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
```

## 연수에서 강조할 점

- 앱은 AI 채점 결과를 초안으로 만든다.
- 최종 점수와 피드백은 교사가 확인하고 저장한다.
- 학생 답안은 교사 개인 Google Drive에 저장된다.
- Firebase 설정은 하지 않는다.
- 한 반씩 PDF를 올리고, 반별로 처리 상태를 확인한다.

## 현재 앱에서 시연 가능한 것

1. 첫 화면에서 Google Drive 연결 버튼 확인
2. 과목 만들기
3. 평가 회차 만들기
4. 시스템 프롬프트에서 루브릭 추출
5. PDF 업로드 후 학생별 분류 확인
6. AI 채점 결과 전체를 교사 편집창으로 가져오는 UI 확인
7. Drive 연결 상태에서는 학생별 `final-grading.json` 저장 확인
8. Drive에 저장된 원본 페이지를 채점 화면에서 다시 확인
9. `ocr-draft.json`, `ocr-confirmed.json` 저장 확인
10. 채점 방식 선택: 텍스트 기반, 이미지 포함, 자동 판단
11. 리포트 화면과 CSV 다운로드 확인
12. 설정 점검 화면에서 환경변수 상태 확인
13. 배포 가이드 화면에서 연수자가 직접 설정 순서 확인
14. 학생별 저장 상태와 실패 학생 재시도 확인

Drive 저장은 OAuth 환경변수가 설정된 뒤 실제 Google Drive에서 확인한다.
