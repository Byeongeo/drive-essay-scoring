import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import type {
  GradeInput,
  GradingSnapshot,
  HeaderExtraction,
  OcrDraft,
  Rubric,
} from "./types";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
// 손글씨 교차검증(2회 OCR)용 대조 모델 — 정확한 기본 모델과 '같게 읽은 글자=명확 /
// 다르게 읽은 글자=불확실(****)'을 가린다. 같은 모델 2회는 똑같이 자신 있게 틀려(환각) 일치해버려
// 못 잡는다 → '다른' 모델 flash-lite 를 대조로 쓰면 환각 지점에서 더 갈라져 잡아낸다. 또렷한 글자까지
// 갈리는 오탐(과다검증)은 감수 — 환각을 놓치느니 ****가 좀 많은 게 낫다. GEMINI_CROSSCHECK_MODEL 로 교체 가능.
const CROSS_CHECK_MODEL = process.env.GEMINI_CROSSCHECK_MODEL || "gemini-3.1-flash-lite";

let client: GoogleGenAI | null = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

function parseJson<T>(text: string | undefined): T {
  if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  return JSON.parse(cleaned) as T;
}

function inlineImage(base64: string, mimeType: string) {
  return { inlineData: { data: base64, mimeType } };
}

/** 일시적(재시도하면 성공할 수 있는) 오류인지 판별 — 429/5xx/네트워크 등 */
function isRetryable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /\b429\b|\b500\b|\b503\b|resource[_ ]?exhausted|rate.?limit|quota|unavailable|internal error|overloaded|deadline|timeout|fetch failed|network|econnreset|socket hang/.test(
    msg,
  );
}

/**
 * Gemini 호출 자동 재시도 래퍼.
 * 일시적 오류(429/5xx/네트워크)에만 지수 백오프로 최대 maxAttempts 회 재시도한다.
 * 400 등 영구 오류는 즉시 throw(헛된 재시도 방지). 동시 접속(여러 교사·학생 일괄 채점) 시
 * 순간적인 rate-limit·과부하 오류를 흡수한다.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const delay = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function resolveGradingModel(input: GradeInput, mode: GradeInput["gradingMode"]) {
  if (mode === "image-assisted") return DEFAULT_MODEL;
  return input.model || DEFAULT_MODEL;
}

const headerSchema = {
  type: Type.OBJECT,
  properties: {
    hasHeader: { type: Type.BOOLEAN },
    grade: { type: Type.NUMBER, nullable: true },
    classNo: { type: Type.NUMBER, nullable: true },
    studentNo: { type: Type.NUMBER, nullable: true },
    name: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER, nullable: true },
  },
  required: ["hasHeader"],
};

export async function extractHeaderFromPage(
  pageImageBase64: string,
  mimeType = "image/jpeg",
): Promise<HeaderExtraction> {
  const ai = getClient();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "답안지 상단 머리글에서 학년, 반, 번호, 이름을 추출하라. " +
                "머리글이 없으면 hasHeader=false로 응답하라. 불확실하면 confidence를 낮게 주라.",
            },
            inlineImage(pageImageBase64, mimeType),
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: headerSchema,
        // 머리글 추출도 추론이 필요 없는 단순 인식 → 사고를 꺼 분류 속도를 크게 높인다.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  );
  return parseJson<HeaderExtraction>(res.text);
}

const rubricSchema = {
  type: Type.OBJECT,
  properties: {
    criteria: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          levels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                score: { type: Type.NUMBER },
                descriptor: { type: Type.STRING },
              },
              required: ["label", "score", "descriptor"],
            },
          },
        },
        required: ["name", "levels"],
      },
    },
  },
  required: ["criteria"],
};

export async function extractRubricFromPrompt(systemPrompt: string): Promise<Rubric> {
  if (!systemPrompt.trim()) {
    throw new Error("시스템 프롬프트가 비어 있어 루브릭을 추출할 수 없습니다.");
  }

  const ai = getClient();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "다음 교사 지시에서 채점 요소, 점수 구간, 점수별 기준을 구조화된 루브릭으로 추출하라. " +
                "점수 기준이 모호하면 가능한 범위에서 추출하되 descriptor에 모호한 점을 명시하라.\n\n" +
                systemPrompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: rubricSchema,
      },
    }),
  );
  return parseJson<Rubric>(res.text);
}

const ocrSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    maskedTokens: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.NUMBER },
          note: { type: Type.STRING, nullable: true },
          pageRef: {
            type: Type.OBJECT,
            properties: {
              fileId: { type: Type.STRING },
              name: { type: Type.STRING },
              mimeType: { type: Type.STRING, nullable: true },
            },
            required: ["fileId", "name"],
          },
          bbox: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              w: { type: Type.NUMBER },
              h: { type: Type.NUMBER },
            },
            required: ["x", "y", "w", "h"],
          },
        },
        required: ["index", "pageRef", "bbox"],
      },
    },
    visualElements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["kind", "description"],
      },
    },
  },
  required: ["text", "maskedTokens", "visualElements"],
};

/**
 * 손글씨 교차검증용 — 두 OCR 결과 텍스트를 어절 단위로 비교해, 서로 '다르게 읽은' 어절만
 * **** 로 가린 primary(정확한 모델) 기준 텍스트를 만든다. 둘 다 같게 읽은 어절 = 명확,
 * 다르게 읽은 어절 = 불확실. 괄호·문장부호·공백 차이는 무시해 노이즈를 억제한다.
 */
function crossCheckMaskText(primary: string, secondary: string): string {
  const PUNCT = /[\[\]【】〔〕(){}<>.,·、…"'`“”‘’:;!?~\-—_/\\|]/g;
  const strip = (w: string) => w.replace(PUNCT, "");
  const isWord = (s: string) => s.length > 0 && !/^\s+$/.test(s);

  const segs = primary.split(/(\s+)/); // 단어/공백(개행 포함) 세그먼트 — 원문 구조 보존
  const pWords: string[] = [];
  segs.forEach((s) => {
    if (isWord(s)) pWords.push(s);
  });
  const sWords = secondary.trim().split(/\s+/).filter(Boolean);

  const a = pWords.map(strip);
  const b = sWords.map(strip);
  const n = a.length;
  const m = b.length;
  // 어절 수가 비정상적으로 많으면(메모리 보호) 교차검증 마스킹을 건너뛰고 정확한 결과를 그대로 쓴다.
  if (n === 0 || (n + 1) * (m + 1) > 4_000_000) return primary;

  const dp = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] =
        a[i] && a[i] === b[j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const agreed = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) {
      agreed[i] = true;
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  // 순수 문장부호/기호(strip 후 빈 문자열)는 항상 보존(노이즈로 ****되지 않게).
  for (let k = 0; k < n; k++) if (a[k] === "") agreed[k] = true;

  let wi = 0;
  const rebuilt = segs
    .map((s) => {
      if (!isWord(s)) return s;
      return agreed[wi++] ? s : "****";
    })
    .join("");
  // 공백으로만 이어진 연속 **** 는 하나로(개행은 보존).
  return rebuilt.replace(/\*\*\*\*(?:[ \t]+\*\*\*\*)+/g, "****");
}

export async function interpretStudentAnswer(
  pages: Array<{
    base64: string;
    mimeType: string;
    fileId: string;
    name: string;
  }>,
  opts: { crossCheck?: boolean } = {},
): Promise<OcrDraft> {
  const ai = getClient();
  const parts: Array<Record<string, unknown>> = [
    {
      text:
        "학생의 수기 답안을 손글씨 원문 그대로, 매우 엄격하게 텍스트화하라. 추측은 절대 금지다. " +
        "【원문 보존】학생이 쓴 글자를 그대로 옮겨라. 맞춤법·띄어쓰기·문법 오류나 오탈자가 있어도 " +
        "네가 고치지 말고 틀린 그대로 옮겨라(맞춤법·오탈자 개수가 채점 기준일 수 있다). " +
        "단, 아래 '교정부호'는 학생이 스스로 고친 표시이므로, 그건 네가 고치는 게 아니라 학생의 최종 의도대로 반영해야 한다. " +
        "【교정부호 — 반드시 해석해 최종 글자만 남겨라】한국어 교정부호를 다음과 같이 처리하라. " +
        "(1) ★삭제(가장 중요): 글자 가운데에 가로줄이 한 줄이라도 그어져 있거나, 두 줄 이상·X자·빗금·동그라미로 묶어 그은 글자는 " +
        "학생이 '지운' 것이다. 그 글자는 최종 텍스트에서 빼고 절대 옮기지 마라. " +
        "(2) 넣기/삽입: ∨·∧ 모양의 삽입 부호, 삽입선, 화살표, 풍선표, 또는 줄 사이·여백에 끼워 쓴 작은 글씨는 " +
        "그 부호가 가리키는 위치에 그 글자를 끼워 넣어 옮겨라. " +
        "(3) 띄어 쓰기/붙여 쓰기: 글자 사이를 벌리라는 ∨ 표는 그 자리를 띄어 쓰고, 글자를 붙이라는 ⌒ 표는 공백 없이 붙여 써라. " +
        "(4) 바꾸기: 글자를 그어 지우고 그 위나 옆에 다른 글자를 쓴 경우, 지운 글자는 버리고 새로 쓴 글자로 바꿔 옮겨라(여러 글자도 동일). " +
        "(5) 순서 바꾸기: 앞뒤 두 글자를 감싸 도는 표(앞뒤 순서를 바꿈)가 있으면 두 글자의 순서를 바꿔 옮겨라. " +
        "(6) 줄 바꾸기/줄 잇기: 줄을 바꾸라는 표는 줄을 바꾸고, 줄을 이으라는 표는 두 줄을 이어 붙여라. " +
        "(7) 칸 옮기기: 왼쪽/오른쪽으로 한 칸 옮기라는 표는 글자는 그대로 두고 위치(띄어쓰기)만 그 방향으로 반영하라. " +
        "【수학·과학 기호 예외 — 삭제로 오해 금지】위 '삭제(가로줄)' 규칙은 한글·일반 문자에 그은 취소선에만 적용한다. " +
        "다음 수학·과학 표기는 교정부호(삭제)가 절대 아니다: 근호(√)의 윗줄, 분수선, 윗줄 표기(반복소수·선분 AB·벡터), " +
        "등호·부등호에 그은 줄(≠, ≤, ≥ 등), 약분·소거 사선 등 '획이 숫자·기호를 가로지르는' 수학 표기. " +
        "이런 기호·수식·도형은 지우거나 글자로 바꾸지 말고 visualElements에 원래 모습대로 설명하라. " +
        "줄이 교정부호(삭제)인지 수학 기호인지 조금이라도 헷갈리면 삭제로 단정하지 말고, 그 부분을 ****로 표시하거나 visualElements에 '불명확'으로 남겨라. " +
        "【조금이라도 불명료하면 무조건 ****】판독은 100% 확신될 때만 글자를 적어라. " +
        "글자가 흐리거나·뭉개졌거나·획이 겹쳤거나·여러 글자로 보일 수 있거나·삭제선인지 글자 획인지 헷갈리는 등 " +
        "조금이라도 명료하지 않은 글자는 추측하거나 문맥으로 그럴듯하게 채우지 말고, 반드시 정확히 `****`로 표시하라. " +
        "매끄러운 문장을 만드는 것보다 '못 읽었음(****)'을 정직히 표시하는 것이 훨씬 더 중요하다. 절대 지어내지 마라. " +
        "단, '또렷이 읽히지만 맞춤법이 틀린 글자'는 ****가 아니라 틀린 그대로 옮겨라 — ****는 '글자 자체를 명료히 알아볼 수 없을 때'만 쓴다. " +
        "수식, 도형, 그래프, 그림, 화학식은 visualElements에 설명하라. " +
        "각 `****`의 위치는 0~1 정규화 bbox로 기록하라. 페이지 참조는 아래 순서를 사용하라.\n" +
        pages.map((p, i) => `[${i}] ${p.fileId} ${p.name}`).join("\n"),
    },
  ];

  for (const page of pages) {
    parts.push(inlineImage(page.base64, page.mimeType));
  }

  // gemini-3.5-flash 는 "사고(thinking)" 모델이라 사고 토큰이 출력 예산을 다 쓰면 JSON 이 잘려
  // (MAX_TOKENS) text 0자가 된다. OCR은 받아쓰기이므로 사고를 끄고(속도↑) 출력 한도를 넉넉히 둔다.
  // flash-lite 등 일부 모델은 thinkingConfig 에서 400을 낼 수 있어, 실패 시 한 번 더(끄고) 시도한다.
  async function generateOcr(model: string): Promise<OcrDraft> {
    const variants: Array<Record<string, unknown>> = [
      { responseMimeType: "application/json", responseSchema: ocrSchema, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 16384 },
      { responseMimeType: "application/json", responseSchema: ocrSchema, maxOutputTokens: 16384 },
    ];
    let lastErr: unknown;
    for (const config of variants) {
      try {
        const res = await withRetry(() =>
          ai.models.generateContent({ model, contents: [{ role: "user", parts: parts as never }], config: config as never }),
        );
        return parseJson<OcrDraft>(res.text);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  if (!opts.crossCheck) {
    return generateOcr(DEFAULT_MODEL);
  }

  // 손글씨 교차검증: 정확한 모델(Flash) + 저비용 모델(Flash-Lite)로 각각 OCR(병렬) 후,
  // 두 결과가 '다르게 읽은 어절'만 **** 로 가린다(같게 읽음=명확). 확정 텍스트·수식 설명
  // (visualElements)·maskedTokens 는 정확한 Flash 결과 기준. 병렬이라 시간은 ≈1배, 비용만 추가.
  const [primary, secondary] = await Promise.all([
    generateOcr(DEFAULT_MODEL),
    generateOcr(CROSS_CHECK_MODEL).catch(() => null),
  ]);
  if (!secondary) return primary; // 대조 모델 실패 시 1회 결과 그대로 사용
  return { ...primary, text: crossCheckMaskText(primary.text, secondary.text) };
}

const gradingSchema = {
  type: Type.OBJECT,
  properties: {
    scores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterionName: { type: Type.STRING },
          score: { type: Type.NUMBER },
          maxScore: { type: Type.NUMBER, nullable: true },
          reason: { type: Type.STRING },
        },
        required: ["criterionName", "score", "reason"],
      },
    },
    totalScore: { type: Type.NUMBER },
    overallReason: { type: Type.STRING },
    feedback: { type: Type.STRING },
  },
  required: ["scores", "totalScore", "overallReason", "feedback"],
};

export async function gradeStudentAnswer(input: GradeInput): Promise<GradingSnapshot> {
  const ai = getClient();
  const rubricText = input.rubric.criteria.length
    ? input.rubric.criteria
        .map((criterion) => {
          const levels = criterion.levels
            .map((level) => `- ${level.label} (${level.score}점): ${level.descriptor}`)
            .join("\n");
          return `채점 요소: ${criterion.name}\n${levels}`;
        })
        .join("\n\n")
    : "구조화된 루브릭 없음. 첨부된 문제지, 채점기준표, 배점표, 시스템 프롬프트에서 채점 기준과 배점을 찾아 적용한다.";

  const exampleText = input.examples.length
    ? input.examples
        .map((example) => {
          const attachmentNames = example.attachments.map((a) => a.name).join(", ");
          return `${example.score}점 예시\n답안: ${example.text || "텍스트 없음"}\n이유: ${
            example.reason || "없음"
          }\n첨부: ${attachmentNames || "없음"}`;
        })
        .join("\n\n")
    : "예시답안 없음";

  const visualText = input.visualElements.length
    ? input.visualElements.map((v) => `- ${v.kind}: ${v.description}`).join("\n")
    : "시각 요소 없음";
  const effectiveMode =
    input.gradingMode === "auto"
      ? input.answerImages.length > 0
        ? "image-assisted"
        : "text-only"
      : input.gradingMode ?? "text-only";

  const parts: Array<Record<string, unknown>> = [
    {
      text:
        "너는 교사를 돕는 서논술형 채점 보조자다. " +
        "채점 결과는 교사가 검토하고 수정할 초안이므로, 점수와 근거를 구체적으로 작성한다. " +
        "구조화된 루브릭이 없으면 첨부된 문제지, 채점기준표, 배점표, 예시답안, 시스템 프롬프트에서 채점 기준을 찾아 적용한다. " +
        "자료 사이에 충돌이 있으면 명시적인 루브릭, 채점기준표, 시스템 프롬프트, 예시답안 순으로 우선 적용한다. " +
        "scores 배열에는 채점기준표에 있는 채점 요소를 빠뜨리지 말고 요소별로 하나씩 넣어라. " +
        "각 score는 해당 요소에서 부여한 점수이고, maxScore는 채점기준표에서 확인한 해당 요소의 만점이다. " +
        "maxScore를 직접 확인할 수 없을 때만 null로 둔다. " +
        "reason에는 왜 그 점수를 주었는지와 해당 요소에서 몇 점 만점에 몇 점을 주었는지를 반드시 포함하라. " +
        "overallReason에는 요소별 점수 합산 과정과 총점 산출 이유를 설명하라. " +
        "feedback에는 학생에게 줄 구체적인 개선 피드백을 작성하라.\n\n" +
        `[문제/채점기준표 첨부]\n${
          input.sourceMaterials?.length
            ? input.sourceMaterials.map((item) => `- ${item.name}`).join("\n")
            : "없음"
        }\n\n` +
        `[루브릭]\n${rubricText}\n\n` +
        `[교사 시스템 프롬프트]\n${input.systemPrompt || "없음"}\n\n` +
        `[예시답안]\n${exampleText}\n\n` +
        `[교사가 확정한 학생 답안 텍스트]\n${input.confirmedAnswerText}\n\n` +
        `[학생 답안의 수식/도형/그림 해석]\n${visualText}\n\n` +
        `[채점 방식]\n${
          effectiveMode === "image-assisted"
            ? "학생 원본 이미지를 함께 참고한다."
            : "학생 답안은 확정 텍스트와 시각 요소 설명을 우선 참고한다."
        }`,
    },
  ];

  if (input.sourceMaterials?.length) {
    parts.push({
      text:
        "다음 첨부 파일들은 교사가 낸 문제, 채점기준표, 배점표, 예시 자료일 수 있다. " +
        "구조화 루브릭이 비어 있으면 이 자료에서 채점 기준과 배점을 찾아 적용하라.",
    });
    for (const material of input.sourceMaterials) {
      parts.push(inlineImage(material.base64, material.mimeType));
    }
  }

  if (input.exampleMaterials?.length) {
    parts.push({
      text:
        "다음 첨부 파일들은 예시답안과 연결된 자료다. 파일명과 예시답안 목록을 대조해 채점 판단에 참고하라.",
    });
    for (const material of input.exampleMaterials) {
      parts.push({ text: `예시답안 ${material.exampleId} 첨부: ${material.name}` });
      parts.push(inlineImage(material.base64, material.mimeType));
    }
  }

  if (effectiveMode === "image-assisted") {
    for (const image of input.answerImages) {
      parts.push(inlineImage(image.base64, image.mimeType));
    }
  }

  const res = await withRetry(() =>
    ai.models.generateContent({
      model: resolveGradingModel(input, effectiveMode),
      contents: [{ role: "user", parts: parts as never }],
      config: {
        responseMimeType: "application/json",
        responseSchema: gradingSchema,
      },
    }),
  );

  return {
    ...parseJson<GradingSnapshot>(res.text),
    gradingMode: effectiveMode,
  };
}
