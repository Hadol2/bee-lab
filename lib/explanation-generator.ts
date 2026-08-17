import { createHash } from "node:crypto";
import { EXPLANATION_MODEL, EXPLANATION_PROMPT_VERSION } from "./explanation-config.ts";
import type { DetailedExplanation } from "./explanations.ts";
import type { ExplanationQuestion } from "./question-library-server.ts";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

const explanationSchema = {
  type: "object",
  required: ["correctReason"],
  properties: {
    correctReason: { type: "string" },
    calculation: { type: "string" },
  },
} as const;

type OllamaResponse = {
  response: string;
  thinking?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

export type ExplanationUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export function getExplanationPromptHash(question: ExplanationQuestion) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        promptVersion: EXPLANATION_PROMPT_VERSION,
        model: EXPLANATION_MODEL,
        questionId: question.id,
        text: question.text,
        choices: question.choices,
        answer: question.answer,
        visuals: question.visuals,
      }),
    )
    .digest("hex");
}

function parseExplanation(value: string, question: ExplanationQuestion): DetailedExplanation {
  const parsed = JSON.parse(value) as Partial<
    Pick<DetailedExplanation, "correctReason" | "calculation">
  >;
  if (
    typeof parsed.correctReason !== "string" ||
    parsed.correctReason.length < 10
  ) {
    throw new Error(`로컬 모델이 불완전한 해설을 반환했습니다: ${value.slice(0, 500)}`);
  }
  const calculation =
    typeof parsed.calculation === "string" && parsed.calculation.trim().length > 0
      ? parsed.calculation
      : null;

  const choiceMarks = ["①", "②", "③", "④"];
  return {
    summary: `정답: ${choiceMarks[question.answer]} ${question.choices[question.answer]}`,
    correctReason: parsed.correctReason,
    calculation,
    examNote:
      question.subject === "폐기물 관계 법규"
        ? "법규 문항은 해당 시험 시행 당시 기준이며 현행 법령과 다를 수 있습니다."
        : null,
  };
}

export async function generateDetailedExplanation(question: ExplanationQuestion) {
  const isCalculation = question.labels.includes("계산형");
  const inferenceModel = question.imageFiles.length
    ? "qwen3-vl:8b"
    : isCalculation
      ? "qwen3:14b"
      : "qwen3:8b";
  const choiceText = question.choices
    .map(
      (choice, index) =>
        `${index + 1}. ${choice}${index === question.answer ? " [교사용 PDF 확정 정답]" : ""}`,
    )
    .join("\n");
  const explanationInstruction = question.imageFiles.length
    ? `이미지의 핵심 정보로 확정 정답 '${question.choices[question.answer]}'을 뒷받침하라. correctReason은 반드시 180자 이내로 작성하라.`
    : isCalculation
      ? `확정 정답 값 '${question.choices[question.answer]}'을 도출하는 핵심 식과 이유를 최대 2문장으로 correctReason에 작성하라. 계산식과 대입 과정은 별도로 calculation 필드에 작성하라. 최종값은 반드시 확정 정답 값과 같아야 한다.`
      : "확정 정답을 뒷받침하는 핵심 개념을 최대 2문장으로 작성하라.";
  const prompt = [
    "/no_think",
    `폐기물처리기사 ${question.examLabel} ${question.number}번의 짧은 학습 해설을 한국어로 작성하라.`,
    `과목: ${question.subject}`,
    `유형: ${question.labels.join(", ")}`,
    `문제: ${question.text}`,
    "선택지:",
    choiceText,
    `확정 정답: ${question.answer + 1}번 ${question.choices[question.answer]}`,
    "정답 번호는 교사용 PDF에서 확정됐으므로 절대 바꾸거나 의심하지 마라.",
    explanationInstruction,
    "교사용 원문을 확인하라는 회피성 문구나 인사말은 쓰지 마라.",
  ].join("\n");

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: inferenceModel,
      system:
        "당신은 폐기물처리기사 필기시험 해설 편집자다. 주어진 확정 정답을 고정하고 간결하고 구체적인 해설만 JSON으로 작성한다.",
      prompt,
      images: question.imageFiles.map((image) => Buffer.from(image.data).toString("base64")),
      format: explanationSchema,
      stream: false,
      think: false,
      keep_alive: "30m",
      options: { temperature: 0.05, num_ctx: 8192, num_predict: 1024 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    throw new Error(`Ollama 응답 오류 ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const result = (await response.json()) as OllamaResponse;
  const explanation = parseExplanation(result.response || result.thinking || "", question);
  const inputTokens = result.prompt_eval_count ?? null;
  const outputTokens = result.eval_count ?? null;
  const usage: ExplanationUsage = {
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens === null && outputTokens === null ? null : (inputTokens ?? 0) + (outputTokens ?? 0),
  };

  return { explanation, usage, estimatedCostUsd: 0 };
}
