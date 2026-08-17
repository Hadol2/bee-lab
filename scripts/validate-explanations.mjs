import { neon } from "@neondatabase/serverless";
import {
  EXPLANATION_MODEL,
  EXPLANATION_PROMPT_VERSION,
} from "../lib/explanation-config.ts";
import {
  listExplanationQuestionIds,
  loadExplanationQuestion,
} from "../lib/question-library-server.ts";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = neon(databaseUrl);
const rows = await sql`
  SELECT c.question_id, g.content
  FROM question_explanation_cache c
  JOIN explanation_generations g ON g.id = c.generation_id
  WHERE g.status = 'complete'
    AND g.model = ${EXPLANATION_MODEL}
    AND g.prompt_version = ${EXPLANATION_PROMPT_VERSION}
`;
const byId = new Map(rows.map((row) => [row.question_id, row.content]));
const questionIds = await listExplanationQuestionIds();
const choiceMarks = ["①", "②", "③", "④"];
const errors = [];
let imageQuestions = 0;
let longestReason = 0;

for (const questionId of questionIds) {
  const question = await loadExplanationQuestion(questionId);
  const content = byId.get(questionId);
  if (!question) {
    errors.push(`${questionId}: 원문 없음`);
    continue;
  }
  if (!content || typeof content !== "object") {
    errors.push(`${questionId}: 해설 없음`);
    continue;
  }
  if (question.imageFiles.length) imageQuestions += 1;

  const expectedSummary = `정답: ${choiceMarks[question.answer]} ${question.choices[question.answer]}`;
  if (content.summary !== expectedSummary) {
    errors.push(`${questionId}: 정답 요약 불일치`);
  }
  if (typeof content.correctReason !== "string" || content.correctReason.trim().length < 10) {
    errors.push(`${questionId}: 해설이 비어 있거나 너무 짧음`);
  } else {
    longestReason = Math.max(longestReason, content.correctReason.length);
    if (/원문.{0,10}(확인|참고)|정답표.{0,10}(기준|확인)|교사용.{0,10}(원문|PDF|정답)|재검토|재확인|오류\s*수정|오류로\s*인한|오류가\s*발생|\?\s*오류|정답은.{0,30}확정/i.test(content.correctReason)) {
      errors.push(`${questionId}: 회피성 해설 문구 포함`);
    }
  }
  if (content.calculation !== null && typeof content.calculation !== "string") {
    errors.push(`${questionId}: calculation 형식 오류`);
  }
  if (content.examNote !== null && typeof content.examNote !== "string") {
    errors.push(`${questionId}: examNote 형식 오류`);
  }
}

for (const questionId of byId.keys()) {
  if (!questionIds.includes(questionId)) errors.push(`${questionId}: 원본에 없는 캐시 문항`);
}

if (errors.length) {
  console.error(errors.slice(0, 100).join("\n"));
  throw new Error(`해설 검증 실패 ${errors.length}건`);
}

console.log(
  `해설 검증 통과: ${questionIds.length}/${questionIds.length}문항, 그림형 ${imageQuestions}문항, 최장 해설 ${longestReason}자`,
);
