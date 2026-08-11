import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OFFICIAL_SUBJECTS,
  createMockExam,
  createSubjectSet,
} from "../lib/question-sets.ts";

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadAllQuestions() {
  const manifest = JSON.parse(
    await readFile(new URL("../public/data/exams/manifest.json", import.meta.url), "utf8"),
  );
  const exams = await Promise.all(
    manifest.map(async (summary) => {
      const payload = JSON.parse(
        await readFile(new URL(`../public${summary.dataUrl}`, import.meta.url), "utf8"),
      );
      return payload.questions;
    }),
  );
  return exams.flat();
}

test("includes all 22 exams with 2,200 complete questions", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/data/exams/manifest.json", import.meta.url), "utf8"),
  );

  assert.equal(manifest.length, 22);
  assert.equal(manifest.reduce((sum, exam) => sum + exam.count, 0), 2200);

  for (const summary of manifest) {
    const exam = JSON.parse(
      await readFile(new URL(`../public${summary.dataUrl}`, import.meta.url), "utf8"),
    );
    assert.equal(exam.questions.length, 100, summary.label);
    assert.ok(exam.questions.every((question) => question.choices.length === 4));
    assert.ok(exam.questions.every((question) => question.labels.length > 0));
  }
});

test("mock exam contains exactly 20 unique questions per official subject", async () => {
  const questions = await loadAllQuestions();
  const mock = createMockExam(questions, seededRandom(20260811));

  assert.equal(mock.length, 100);
  assert.equal(new Set(mock.map((question) => question.id)).size, 100);
  for (const subject of OFFICIAL_SUBJECTS) {
    assert.equal(mock.filter((question) => question.subject === subject).length, 20);
  }
});

test("subject practice draws 20 unique questions from the selected subject", async () => {
  const questions = await loadAllQuestions();
  const set = createSubjectSet(
    questions,
    "폐기물 공정시험기준",
    20,
    seededRandom(42),
  );

  assert.equal(set.length, 20);
  assert.equal(new Set(set.map((question) => question.id)).size, 20);
  assert.ok(set.every((question) => question.subject === "폐기물 공정시험기준"));
});
