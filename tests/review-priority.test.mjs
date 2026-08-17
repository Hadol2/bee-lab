import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "scripts", "build-review-priority.mjs");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "review-priority.json");
const MANIFEST_PATH = path.join(ROOT, "public", "data", "exams", "manifest.json");
const EXAMS_DIR = path.join(ROOT, "public", "data", "exams");

const OFFICIAL_SUBJECTS = [
  "폐기물 개론",
  "폐기물 처리 기술",
  "폐기물 소각 및 열회수",
  "폐기물 공정시험기준",
  "폐기물 관계 법규",
];

function runGenerator() {
  execFileSync("node", [SCRIPT_PATH], { cwd: ROOT, stdio: "pipe" });
}

async function loadAllQuestions() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const questions = [];
  for (const entry of manifest) {
    const exam = JSON.parse(await readFile(path.join(EXAMS_DIR, `${entry.date}.json`), "utf8"));
    questions.push(...exam.questions);
  }
  return questions;
}

test("generator source never scores using .labels or keyPoint", async () => {
  const source = await readFile(SCRIPT_PATH, "utf8");
  assert.equal(/\.labels\b/.test(source), false);
  assert.equal(/keyPoint/.test(source), false);
});

test("generator source scores explicit calculation/unit signals from text and choices", async () => {
  const source = await readFile(SCRIPT_PATH, "utf8");
  assert.match(source, /question\.text/);
  assert.match(source, /kcal/);
  assert.match(source, /mg/);
  for (const token of ["kg", "ton", "mol", "ppm", "유량", "농도", "효율", "함수율", "발열량", "계산", "구하"]) {
    assert.ok(source.includes(token), `계산 신호 토큰 누락: ${token}`);
  }
});

test("review-priority.json selects exactly 60 questions per legacy subject", async () => {
  runGenerator();
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  assert.equal(output.items.length, 300);

  const bySubject = {};
  for (const item of output.items) {
    assert.equal("subject" in item, false, "item에 옛 subject 필드가 남아있으면 안 됩니다");
    bySubject[item.legacySubject] = (bySubject[item.legacySubject] ?? 0) + 1;
  }
  for (const subject of OFFICIAL_SUBJECTS) {
    assert.equal(bySubject[subject], 60, `${subject} 선정 개수가 60이 아닙니다`);
  }
  assert.equal(Object.keys(bySubject).length, OFFICIAL_SUBJECTS.length);
});

test("review-priority.json items include legacySubject and derived examDate", async () => {
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  for (const item of output.items) {
    assert.ok(OFFICIAL_SUBJECTS.includes(item.legacySubject), `알 수 없는 legacySubject: ${item.legacySubject}`);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.examDate);
    assert.ok(match, `examDate 형식이 올바르지 않습니다: ${item.examDate}`);
    const expected = `${item.questionId.slice(0, 4)}-${item.questionId.slice(4, 6)}-${item.questionId.slice(6, 8)}`;
    assert.equal(item.examDate, expected, "examDate가 questionId로부터 올바르게 파생되지 않았습니다");
  }
});

test("review-priority.json items are ranked 1..300 with no duplicate questionIds", async () => {
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  const ranks = output.items.map((item) => item.rank);
  assert.deepEqual(ranks, Array.from({ length: 300 }, (_, i) => i + 1));

  const ids = output.items.map((item) => item.questionId);
  assert.equal(new Set(ids).size, ids.length);
});

test("review-priority.json ties break by ascending questionId", async () => {
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  for (let i = 1; i < output.items.length; i += 1) {
    const prev = output.items[i - 1];
    const curr = output.items[i];
    if (prev.score === curr.score) {
      assert.ok(
        prev.questionId.localeCompare(curr.questionId) < 0,
        `동점 항목 순서가 ID 오름차순이 아닙니다: ${prev.questionId} -> ${curr.questionId}`,
      );
    } else {
      assert.ok(prev.score > curr.score, "점수는 내림차순이어야 합니다");
    }
  }
});

test("review-priority.json all questionIds reference real questions", async () => {
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  const questions = await loadAllQuestions();
  const validIds = new Set(questions.map((q) => q.id));
  for (const item of output.items) {
    assert.ok(validIds.has(item.questionId), `존재하지 않는 questionId: ${item.questionId}`);
  }
});

test("review-priority.json items default to unreviewed status and clarify machine prioritization", async () => {
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  for (const item of output.items) {
    assert.equal(item.reviewStatus, "unreviewed");
  }
  assert.match(output.metadata.description, /기계적/);
  assert.match(output.metadata.description, /검수가 완료되었음을 의미하지 않습니다/);
});

test("review-priority.json metadata declares version, stable generatedAt, and machine-prioritization methodology", async () => {
  const output = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  assert.equal(output.metadata.version, 1);
  assert.equal(output.metadata.generatedAt, "2026-08-14");
  assert.match(output.metadata.methodology, /기계적|기계/);
  assert.match(output.metadata.methodology, /사람에 의한 실제 검수/);
});

test("generator is deterministic across repeated runs", async () => {
  runGenerator();
  const first = await readFile(OUTPUT_PATH, "utf8");
  runGenerator();
  const second = await readFile(OUTPUT_PATH, "utf8");
  assert.equal(first, second);
});
