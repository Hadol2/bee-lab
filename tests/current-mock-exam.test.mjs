import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CURRENT_SUBJECT_KEYS,
  OFFICIAL_SUBJECTS,
  createCurrentMockExam,
  createMockExam,
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

async function loadMapping() {
  return JSON.parse(
    await readFile(new URL("../public/data/domain-mapping.json", import.meta.url), "utf8"),
  );
}

test("T3: legacy createMockExam is untouched (100 questions, 5 subjects x 20)", async () => {
  const questions = await loadAllQuestions();
  const mock = createMockExam(questions, seededRandom(20260814));

  assert.equal(mock.length, 100);
  assert.equal(new Set(mock.map((question) => question.id)).size, 100);
  for (const subject of OFFICIAL_SUBJECTS) {
    assert.equal(mock.filter((question) => question.subject === subject).length, 20);
  }
});

test("T3: createCurrentMockExam draws 80 unique questions (4 x 20) from a fully-mapped fixture, reproducibly under a fixed seed", () => {
  // Synthetic fixture, not production data: exercises the pure selection
  // logic in isolation, independent of whether the real domain-mapping.json
  // currently has enough mapped candidates for every current-subject slot.
  const fixtureQuestions = CURRENT_SUBJECT_KEYS.flatMap((key) =>
    Array.from({ length: 25 }, (_, index) => ({
      id: `fixture-${key}-${String(index).padStart(2, "0")}`,
      subject: `legacy-for-${key}`,
    })),
  );
  const fixtureMapping = {
    version: 2,
    records: fixtureQuestions.map((question) => ({
      questionId: question.id,
      currentSubjectKey: CURRENT_SUBJECT_KEYS.find((key) => question.id.includes(`fixture-${key}-`)),
      eligibleForCurrentMock: true,
    })),
  };

  const first = createCurrentMockExam(fixtureQuestions, fixtureMapping, seededRandom(42));
  const second = createCurrentMockExam(fixtureQuestions, fixtureMapping, seededRandom(42));

  assert.equal(first.length, 80);
  assert.equal(new Set(first.map((question) => question.id)).size, 80);
  for (const key of CURRENT_SUBJECT_KEYS) {
    assert.equal(
      first.filter((question) => question.id.includes(`fixture-${key}-`)).length,
      20,
    );
  }
  assert.deepEqual(
    first.map((question) => question.id),
    second.map((question) => question.id),
    "동일 시드는 동일한 80문제 구성을 재현해야 합니다.",
  );
});

test("T3: real domain-mapping.json never routes the freshness-gated 「폐기물 관계 법규」 440 questions into any current-subject candidate pool", async () => {
  const questions = await loadAllQuestions();
  const mapping = await loadMapping();
  const lawIds = new Set(
    questions
      .filter((question) => question.subject === "폐기물 관계 법규")
      .map((question) => question.id),
  );

  const mappedToCurrentSubjects = mapping.records
    .filter((record) => record.eligibleForCurrentMock)
    .map((record) => record.questionId);

  const overlap = mappedToCurrentSubjects.filter((id) => lawIds.has(id));
  assert.equal(overlap.length, 0);
});

test("T3: createCurrentMockExam throws when a current-subject pool is underfilled", () => {
  const fixtureQuestions = CURRENT_SUBJECT_KEYS.flatMap((key, keyIndex) =>
    Array.from({ length: keyIndex === 0 ? 5 : 25 }, (_, index) => ({
      id: `fixture-${key}-${String(index).padStart(2, "0")}`,
      subject: `legacy-for-${key}`,
    })),
  );
  const fixtureMapping = {
    version: 2,
    records: fixtureQuestions.map((question) => ({
      questionId: question.id,
      currentSubjectKey: CURRENT_SUBJECT_KEYS.find((key) => question.id.includes(`fixture-${key}-`)),
      eligibleForCurrentMock: true,
    })),
  };

  assert.throws(() => createCurrentMockExam(fixtureQuestions, fixtureMapping, seededRandom(42)));
});

test("T3: createCurrentMockExam succeeds against the real domain-mapping.json (every current-subject has >=20 eligible candidates)", async () => {
  const questions = await loadAllQuestions();
  const mapping = await loadMapping();

  const mock = createCurrentMockExam(questions, mapping, seededRandom(1));

  assert.equal(mock.length, 80);
  assert.equal(new Set(mock.map((question) => question.id)).size, 80);
});
