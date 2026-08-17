import { spawn } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { EXPLANATION_MODEL, EXPLANATION_PROMPT_VERSION } from "../lib/explanation-config.ts";
import { getExplanationPromptHash } from "../lib/explanation-generator.ts";
import {
  listExplanationQuestionIds,
  loadExplanationQuestion,
} from "../lib/question-library-server.ts";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = neon(databaseUrl);

function option(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function runClaude(prompt, schema) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--safe-mode",
        "--setting-sources",
        "",
        "--system-prompt",
        "Return only the requested valid JSON. Do not use tools.",
        "--model",
        "haiku",
        "--effort",
        "low",
        "--tools",
        "",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(schema),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude batch timed out"));
    }, 300_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude exited ${code}: ${stderr.slice(0, 1000)}`));
        return;
      }
      try {
        const outer = JSON.parse(stdout);
        resolve({
          items: outer.structured_output?.items ?? [],
          costUsd: Number(outer.total_cost_usd ?? 0),
        });
      } catch (error) {
        reject(new Error(`Claude JSON parse failed: ${error.message}`));
      }
    });
    child.stdin.end(prompt);
  });
}

function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      [
        "exec",
        "-C",
        "/tmp",
        "--model",
        "gpt-5.4-mini",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--color",
        "never",
        "-",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex batch timed out"));
    }, 300_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Codex exited ${code}: ${stderr.slice(-1000)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ items: parsed.items ?? [], costUsd: 0 });
      } catch (error) {
        reject(new Error(`Codex JSON parse failed: ${error.message}`));
      }
    });
    child.stdin.end([
      "도구를 사용하지 말고 요청한 JSON 객체 한 개만 출력한다.",
      '{"items":[{"questionId":"문항 ID","correctReason":"한국어 해설"}]} 형식을 지킨다.',
      prompt,
    ].join("\n"));
  });
}

const itemSchema = {
  type: "object",
  required: ["questionId", "correctReason"],
  properties: {
    questionId: { type: "string" },
    correctReason: { type: "string" },
  },
};
const responseSchema = {
  type: "object",
  required: ["items"],
  properties: { items: { type: "array", items: itemSchema } },
};

const batchSize = positiveInteger(option("batch-size"), 40, "batch-size");
const limit = positiveInteger(option("limit"), Number.MAX_SAFE_INTEGER, "limit");
const onlyDate = option("date");
const provider = option("provider") ?? "claude";
if (onlyDate && !/^\d{8}$/.test(onlyDate)) throw new Error("date must be YYYYMMDD");
if (!["claude", "codex"].includes(provider)) throw new Error("provider must be claude or codex");

await sql`
  UPDATE explanation_generations
  SET status = 'error', error_message = 'stale batch claim recovered', updated_at = CURRENT_TIMESTAMP
  WHERE status = 'pending' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
`;

let ids = await listExplanationQuestionIds();
if (onlyDate) ids = ids.filter((id) => id.startsWith(`${onlyDate}-`));

const questions = [];
for (const id of ids) {
  if (questions.length >= limit) break;
  const question = await loadExplanationQuestion(id);
  if (question && question.imageFiles.length === 0) questions.push(question);
}

let generated = 0;
let skipped = 0;
let failed = 0;
let reportedCostUsd = 0;
const choiceMarks = ["①", "②", "③", "④"];

for (const [batchIndex, batch] of chunks(questions, batchSize).entries()) {
  const claimed = [];
  for (const question of batch) {
    const promptHash = getExplanationPromptHash(question);
    const complete = await sql`
      SELECT id FROM explanation_generations
      WHERE question_id = ${question.id} AND prompt_hash = ${promptHash} AND status = 'complete'
      LIMIT 1
    `;
    if (complete[0]?.id) {
      await sql`
        INSERT INTO question_explanation_cache (question_id, generation_id)
        VALUES (${question.id}, ${complete[0].id})
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
        ${generationId}, ${question.id}, ${EXPLANATION_MODEL},
        ${EXPLANATION_PROMPT_VERSION}, ${promptHash}, 'pending'
      )
      ON CONFLICT DO NOTHING RETURNING id
    `;
    if (claim[0]?.id) claimed.push({ question, generationId });
    else skipped += 1;
  }
  if (claimed.length === 0) continue;

  const payload = claimed.map(({ question }) => ({
    questionId: question.id,
    subject: question.subject,
    labels: question.labels,
    question: question.text,
    choices: question.choices.map((choice, index) => `${index + 1}. ${choice}`),
    fixedAnswerNumber: question.answer + 1,
    fixedAnswerText: question.choices[question.answer],
  }));
  const prompt = [
    "폐기물처리기사 문항별 해설을 한국어로 작성한다.",
    "각 fixedAnswerNumber와 fixedAnswerText는 교사용 PDF에서 확정되었으므로 절대 변경하거나 의심하지 않는다.",
    "각 correctReason은 확정 정답을 뒷받침하는 핵심 개념 또는 정확한 계산을 1~2문장으로 쓴다.",
    "계산형은 식, 대입, 단위를 포함하고 최종값이 fixedAnswerText와 일치하는지 확인한다.",
    "옳지 않은 것/거리가 먼 것을 묻는 문항은 정답 선택지가 왜 틀린 설명인지 직접 밝힌다.",
    "법규 문항은 시험 시행 당시 기준으로 설명하며 현행법이라고 단정하지 않는다.",
    "원문을 확인하라는 회피 문구, 인사말, 정답표만 언급하는 문구는 금지한다.",
    "입력 순서와 같은 순서로 모든 questionId를 정확히 한 번씩 반환한다.",
    JSON.stringify(payload),
  ].join("\n");

  try {
    const result = provider === "codex" ? await runCodex(prompt) : await runClaude(prompt, responseSchema);
    reportedCostUsd += result.costUsd;
    const byId = new Map(result.items.map((item) => [item.questionId, item]));
    for (const { question, generationId } of claimed) {
      const item = byId.get(question.id);
      if (!item || typeof item.correctReason !== "string" || item.correctReason.length < 10) {
        failed += 1;
        await sql`
          UPDATE explanation_generations SET status = 'error',
            error_message = '배치 결과에 유효한 해설이 없음', updated_at = CURRENT_TIMESTAMP
          WHERE id = ${generationId}
        `;
        continue;
      }
      const explanation = {
        summary: `정답: ${choiceMarks[question.answer]} ${question.choices[question.answer]}`,
        correctReason: item.correctReason,
        calculation: null,
        examNote:
          question.subject === "폐기물 관계 법규"
            ? "법규 문항은 해당 시험 시행 당시 기준이며 현행 법령과 다를 수 있습니다."
            : null,
      };
      await sql`
        UPDATE explanation_generations
        SET status = 'complete', content = ${JSON.stringify(explanation)}::jsonb,
          token_usage = ${JSON.stringify({ batchSize: claimed.length })}::jsonb,
          estimated_cost_usd = 0, review_status = 'unreviewed',
          error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${generationId}
      `;
      await sql`
        INSERT INTO question_explanation_cache (question_id, generation_id)
        VALUES (${question.id}, ${generationId})
        ON CONFLICT (question_id) DO UPDATE
        SET generation_id = excluded.generation_id, updated_at = CURRENT_TIMESTAMP
      `;
      generated += 1;
    }
    console.log(
      `[${batchIndex + 1}/${Math.ceil(questions.length / batchSize)}] ${claimed.length}문항 완료 · 생성 ${generated} · 사용량 환산 $${reportedCostUsd.toFixed(3)}`,
    );
  } catch (error) {
    failed += claimed.length;
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Claude batch failed";
    for (const { generationId } of claimed) {
      await sql`
        UPDATE explanation_generations SET status = 'error', error_message = ${message},
          updated_at = CURRENT_TIMESTAMP WHERE id = ${generationId}
      `;
    }
    console.error(`[${batchIndex + 1}] ${message}`);
  }
}

console.log(
  `텍스트 문항 배치 종료: 신규 ${generated}, 기존 ${skipped}, 실패 ${failed}, 사용량 환산 $${reportedCostUsd.toFixed(3)}`,
);
