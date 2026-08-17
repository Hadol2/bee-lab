import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("question reports require login, validate input, and update an existing open report", async () => {
  const route = await readFile(
    new URL("../app/api/reports/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /auth\.getSession/);
  assert.match(route, /status: 401/);
  assert.match(route, /loadExplanationQuestion/);
  assert.match(route, /details\.length < 10/);
  assert.match(route, /ON CONFLICT \(user_key, question_id\) WHERE status = 'open'/);
});

test("report storage keeps moderation status and prevents duplicate open reports", async () => {
  const migration = await readFile(
    new URL("../scripts/migrate.mjs", import.meta.url),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS question_reports/);
  assert.match(migration, /'open', 'resolved', 'dismissed'/);
  assert.match(migration, /question_reports_open_user_question_idx/);
});

test("checked questions expose an authenticated error report form", async () => {
  const app = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(app, /이 문제 오류 제보/);
  assert.match(app, /로그인하고 오류 제보/);
  assert.match(app, /fetch\("\/api\/reports"/);
  assert.match(app, /문제·선택지 오타/);
});
