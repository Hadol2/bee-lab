import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the waste engineer study app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /폐기물기사/);
  assert.match(html, /기출문제 집중 학습/);
  assert.match(html, /2022년 2회/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Building your site/);
});

test("includes every imported exam with complete answers", async () => {
  const manifestUrl = new URL("../public/data/exams/manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.length, 22);
  assert.equal(manifest.reduce((sum, exam) => sum + exam.count, 0), 2200);

  for (const summary of manifest) {
    const examUrl = new URL(`../public${summary.dataUrl}`, import.meta.url);
    const exam = JSON.parse(await readFile(examUrl, "utf8"));
    assert.equal(exam.questions.length, 100, summary.label);
    assert.deepEqual(
      exam.questions.map((question) => question.number),
      Array.from({ length: 100 }, (_, index) => index + 1),
      summary.label,
    );
    for (const question of exam.questions) {
      assert.equal(question.choices.length, 4, question.id);
      assert.ok(question.choices.every(Boolean), question.id);
      assert.ok(question.answer >= 0 && question.answer <= 3, question.id);
      assert.ok(question.labels.length > 0, question.id);
      if (question.choices.some((choice) => choice.startsWith("원문의"))) {
        assert.ok(question.visuals.length > 0, question.id);
      }
    }
  }
});
