import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public explanation API only reads completed database content", async () => {
  const route = await readFile(
    new URL("../app/api/explanations/[questionId]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.doesNotMatch(route, /generateText|generateDetailedExplanation/);
  assert.match(route, /g\.status = 'complete'/);
});

test("batch generator is restartable and uses a local model without AI API billing", async () => {
  const batch = await readFile(
    new URL("../scripts/generate-explanations.mjs", import.meta.url),
    "utf8",
  );

  assert.match(batch, /ON CONFLICT DO NOTHING/);
  assert.match(batch, /status = 'complete'/);
  assert.doesNotMatch(batch, /max-cost-usd|AI_GATEWAY_API_KEY/);

  const generator = await readFile(
    new URL("../lib/explanation-generator.ts", import.meta.url),
    "utf8",
  );
  assert.match(generator, /127\.0\.0\.1:11434/);
  assert.doesNotMatch(generator, /generateText|openai\//);
});
