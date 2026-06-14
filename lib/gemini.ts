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
  const res = await ai.models.generateContent({
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
    },
  });
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
  const res = await ai.models.generateContent({
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
  });
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
        "학생의 수기 답안을 가능한 정확하게 텍스트화하라. " +
        "읽기 어렵거나 확신할 수 없는 글자, 숫자, 기호, 수식 일부는 정확히 `****`로 표시하라. " +
        "수식, 도형, 그래프, 그림, 화학식은 visualElements에 설명하라. " +
        "각 `****`의 위치는 0~1 정규화 bbox로 기록하라. 페이지 참조는 아래 순서를 사용하라.\n" +
        pages.map((p, i) => `[${i}] ${p.fileId} ${p.name}`).join("\n"),
    },
  ];

  for (const page of pages) {
    parts.push(inlineImage(page.base64, page.mimeType));
  }

  const res = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [{ role: "user", parts: parts as never }],
    config: {
      responseMimeType: "application/json",
      responseSchema: ocrSchema,
    },
  });

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

  const res = await ai.models.generateContent({
    model: resolveGradingModel(input, effectiveMode),
    contents: [{ role: "user", parts: parts as never }],
    config: {
      responseMimeType: "application/json",
      responseSchema: gradingSchema,
    },
  });

  return {
    ...parseJson<GradingSnapshot>(res.text),
    gradingMode: effectiveMode,
  };
}
