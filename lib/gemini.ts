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

export async function interpretStudentAnswer(
  pages: Array<{
    base64: string;
    mimeType: string;
    fileId: string;
    name: string;
  }>,
): Promise<OcrDraft> {
  const ai = getClient();
  const parts: Array<Record<string, unknown>> = [
    {
      text:
        "학생의 수기 답안을 손글씨 원문 그대로 텍스트화하라. " +
        "【원문 보존】학생이 쓴 글자를 그대로 옮겨라. 맞춤법·띄어쓰기·문법 오류나 오탈자가 있어도 " +
        "절대 고치지 말고 틀린 그대로 옮겨라(맞춤법·오탈자 개수가 채점 기준일 수 있다). " +
        "【추측 금지】또렷이 판독되는 글자만 옮겨라. 조금이라도 불확실한 글자·숫자·기호·수식 일부는 " +
        "추측하거나 문맥으로 그럴듯하게 채워 넣지 말고 정확히 `****`로 표시하라. " +
        "단, '또렷이 읽히지만 맞춤법이 틀린 글자'는 ****가 아니라 틀린 그대로 옮겨라(글자를 못 알아보는 경우에만 ****). " +
        "【교정부호】학생이 손으로 고친 흔적을 정확히 반영하라. " +
        "(1) 취소선·가로줄·두 줄로 그어 지운 글자는 학생이 삭제한 것이므로 옮기지 마라(지웠는지 불확실하면 그 자리에 ****). " +
        "(2) 삽입 부호(∨, 삽입선, 화살표, 풍선표, 줄 사이·여백에 끼워 쓴 작은 글씨)는 부호가 가리키는 위치에 그 글자를 삽입해 옮겨라. " +
        "(3) ★가장 중요: 삽입·교정한 작은 글씨가 또렷이 안 읽히면, 문맥에 맞는 그럴듯한 단어를 절대 지어내지 마라. " +
        "반드시 그 자리에 **** 로 표기하라. 매끄러운 문장을 만드는 것보다 '못 읽었음(****)'을 정직히 표시하는 것이 훨씬 중요하다. " +
        "수식, 도형, 그래프, 그림, 화학식은 visualElements에 설명하라. " +
        "각 `****`의 위치는 0~1 정규화 bbox로 기록하라. 페이지 참조는 아래 순서를 사용하라.\n" +
        pages.map((p, i) => `[${i}] ${p.fileId} ${p.name}`).join("\n"),
    },
  ];

  for (const page of pages) {
    parts.push(inlineImage(page.base64, page.mimeType));
  }

  const res = await withRetry(() =>
    ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts: parts as never }],
      config: {
        responseMimeType: "application/json",
        responseSchema: ocrSchema,
        // ⚠️ gemini-3.5-flash 는 "사고(thinking)" 모델이라, 사고 토큰이 출력 예산을 다 써버리면
        //    정작 JSON 출력이 잘려(finishReason=MAX_TOKENS) 파싱 실패 → text 0자가 된다.
        //    (8192 한도일 때 사고가 ~7000~7900 토큰을 먹어 답안이 조금만 길어도 0자·매우 느림 — 실측 확인.)
        //    OCR은 추론이 필요 없는 '받아쓰기'이므로 사고를 끄고(=속도↑), 여러 페이지 긴 답안도
        //    담기도록 출력 한도를 넉넉히 둔다. (런어웨이는 16384 상한으로 여전히 차단.)
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 16384,
      },
    }),
  );

  return parseJson<OcrDraft>(res.text);
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
