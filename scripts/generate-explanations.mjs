import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import {
  generateDetailedExplanation,
  getExplanationPromptHash,
} from "../lib/explanation-generator.ts";
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

function option(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveNumber(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

async function retryDatabase(operation) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

const sql = neon(databaseUrl);
const limit = Math.floor(positiveNumber(option("limit"), Number.POSITIVE_INFINITY, "limit"));
const onlyDate = option("date");
const onlyQuestion = option("question");
const imagesOnly = process.argv.includes("--images-only");

if (onlyDate && !/^\d{8}$/.test(onlyDate)) throw new Error("date must be YYYYMMDD");
if (onlyQuestion && !/^\d{8}-\d{3}$/.test(onlyQuestion)) {
  throw new Error("question must look like YYYYMMDD-001");
}

await sql`
  UPDATE explanation_generations
  SET status = 'error', error_message = 'stale batch claim recovered',
      updated_at = CURRENT_TIMESTAMP
  WHERE status = 'pending'
    AND updated_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
`;

let questionIds = await listExplanationQuestionIds();
if (onlyDate) questionIds = questionIds.filter((id) => id.startsWith(`${onlyDate}-`));
if (onlyQuestion) questionIds = questionIds.filter((id) => id === onlyQuestion);
if (imagesOnly) {
  const imageQuestionIds = [];
  for (const id of questionIds) {
    const question = await loadExplanationQuestion(id);
    if (question?.imageFiles.length) imageQuestionIds.push(id);
  }
  questionIds = imageQuestionIds;
}
questionIds = questionIds.slice(0, limit);

let generated = 0;
let skipped = 0;
let failed = 0;

console.log(
  `해설 배치 시작: ${questionIds.length}문항, 로컬 모델 ${EXPLANATION_MODEL}, API 비용 없음`,
);

for (const [index, questionId] of questionIds.entries()) {
  const question = await loadExplanationQuestion(questionId);
  if (!question) {
    failed += 1;
    console.error(`[${index + 1}/${questionIds.length}] ${questionId}: 원문을 찾지 못했습니다.`);
    continue;
  }

  const promptHash = getExplanationPromptHash(question);
  const complete = await sql`
    SELECT id
    FROM explanation_generations
    WHERE question_id = ${questionId}
      AND prompt_hash = ${promptHash}
      AND status = 'complete'
    LIMIT 1
  `;
  if (complete[0]?.id) {
    await sql`
      INSERT INTO question_explanation_cache (question_id, generation_id)
      VALUES (${questionId}, ${complete[0].id})
      ON CONFLICT (question_id) DO UPDATE
      SET generation_id = excluded.generation_id, updated_at = CURRENT_TIMESTAMP
    `;
    skipped += 1;
    continue;
  }

  const generationId = nanoid();
  const claim = await sql`
    INSERT INTO explanation_generations (
      id, question_id, model, prompt_version, prompt_hash, status
    ) VALUES (
      ${generationId}, ${questionId}, ${EXPLANATION_MODEL},
      ${EXPLANATION_PROMPT_VERSION}, ${promptHash}, 'pending'
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if (!claim[0]?.id) {
    skipped += 1;
    console.log(`[${index + 1}/${questionIds.length}] ${questionId}: 다른 작업이 처리 중이라 건너뜀`);
    continue;
  }

  let generatedResult;
  try {
    generatedResult = await generateDetailedExplanation(question);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message.slice(0, 1000) : "해설 생성 실패";
    await retryDatabase(() => sql`
      UPDATE explanation_generations
      SET status = 'error', error_message = ${message}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${generationId}
    `);
    console.error(`[${index + 1}/${questionIds.length}] ${questionId}: ${message}`);
    continue;
  }

  const { explanation, usage, estimatedCostUsd } = generatedResult;
  await retryDatabase(() => sql`
    UPDATE explanation_generations
    SET status = 'complete', content = ${JSON.stringify(explanation)}::jsonb,
        token_usage = ${JSON.stringify(usage)}::jsonb,
        estimated_cost_usd = ${estimatedCostUsd}, review_status = 'unreviewed',
        error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${generationId}
  `);
  await retryDatabase(() => sql`
    INSERT INTO question_explanation_cache (question_id, generation_id)
    VALUES (${questionId}, ${generationId})
    ON CONFLICT (question_id) DO UPDATE
    SET generation_id = excluded.generation_id, updated_at = CURRENT_TIMESTAMP
  `);

  generated += 1;
  console.log(`[${index + 1}/${questionIds.length}] ${questionId}: 완료`);
}

const coverage = await sql`
  SELECT COUNT(DISTINCT c.question_id)::int AS count
  FROM question_explanation_cache c
  JOIN explanation_generations g ON g.id = c.generation_id
  WHERE g.status = 'complete'
    AND g.model = ${EXPLANATION_MODEL}
    AND g.prompt_version = ${EXPLANATION_PROMPT_VERSION}
    AND g.content IS NOT NULL
`;

console.log(
  `배치 종료: 신규 ${generated}, 기존 ${skipped}, 실패 ${failed}, API 비용 $0, 전체 ${coverage[0]?.count ?? 0}/2200문항`,
);
