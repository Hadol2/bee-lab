import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { isFreshnessRecord, getFreshnessNotice, TEST_STANDARD_SUBJECT, LAW_SUBJECT } from "../lib/freshness.ts";

const execFileAsync = promisify(execFile);

const TARGET_SUBJECTS = [TEST_STANDARD_SUBJECT, LAW_SUBJECT];

async function loadFreshness() {
  const raw = await readFile(new URL("../public/data/freshness.json", import.meta.url), "utf8");
  return JSON.parse(raw);
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

test("freshness.json has exactly 800 unique questionId records", async () => {
  const records = await loadFreshness();
  assert.equal(records.length, 800);
  assert.equal(new Set(records.map((r) => r.questionId)).size, 800);
});

test("freshness coverage equals exactly the two legacy subjects, all questions covered", async () => {
  const records = await loadFreshness();
  const questions = await loadAllQuestions();

  const expectedIds = new Set(
    questions.filter((q) => TARGET_SUBJECTS.includes(q.subject)).map((q) => q.id),
  );
  const actualIds = new Set(records.map((r) => r.questionId));

  assert.equal(actualIds.size, expectedIds.size);
  for (const id of expectedIds) assert.ok(actualIds.has(id), `missing freshness record for ${id}`);
  for (const id of actualIds) assert.ok(expectedIds.has(id), `unexpected freshness record for ${id}`);

  const subjects = new Set(records.map((r) => r.legacySubject));
  assert.equal(subjects.size, 2);
  for (const subject of subjects) assert.ok(TARGET_SUBJECTS.includes(subject));
});

test("every record is unverified with null delta/verifiedBy and never claims changed/unchanged", async () => {
  const records = await loadFreshness();
  for (const record of records) {
    assert.equal(record.status, "unverified");
    assert.equal(record.delta, null);
    assert.equal(record.verifiedBy, null);
    assert.doesNotMatch(record.note, /변경(됨|되지 않았|없)|미변경|동일함|현행.*(유효|일치)|바뀌(었|지 않았)/);
    assert.doesNotMatch(record.note, /changed|unchanged/i);
  }
});

test("no verifiedBy-null record claims changed/unchanged anywhere in provenance fields", async () => {
  const records = await loadFreshness();
  for (const record of records) {
    if (record.verifiedBy !== null) continue;
    const serialized = JSON.stringify(record);
    assert.doesNotMatch(serialized, /"status":"(changed|unchanged|current-valid)"/);
  }
});

test("exactly 400 test-standard records carry the exact official standard, and exactly 400 law records carry null currentStandard", async () => {
  const records = await loadFreshness();
  const expectedStandard = {
    name: "폐기물공정시험기준",
    ref: "국립환경과학원고시 제2025-21호",
    effective: "2025-08-06",
    url: "https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000263068",
  };

  const testStandardRecords = records.filter((r) => r.legacySubject === TEST_STANDARD_SUBJECT);
  const lawRecords = records.filter((r) => r.legacySubject === LAW_SUBJECT);

  assert.equal(testStandardRecords.length, 400);
  assert.equal(lawRecords.length, 400);

  for (const record of testStandardRecords) {
    assert.deepEqual(record.currentStandard, expectedStandard);
  }
  for (const record of lawRecords) {
    assert.equal(record.currentStandard, null);
  }
});

test("no law record mentions the testing-standard reference or name anywhere", async () => {
  const records = await loadFreshness();
  const lawRecords = records.filter((r) => r.legacySubject === LAW_SUBJECT);
  assert.ok(lawRecords.length > 0);

  for (const record of lawRecords) {
    const serialized = JSON.stringify(record);
    assert.doesNotMatch(serialized, /폐기물공정시험기준/);
    assert.doesNotMatch(serialized, /국립환경과학원고시/);
    assert.doesNotMatch(serialized, /law\.go\.kr/);
  }
});

test("every record satisfies the FreshnessRecord shape", async () => {
  const records = await loadFreshness();
  for (const record of records) {
    assert.ok(isFreshnessRecord(record), `not a valid FreshnessRecord: ${record.questionId}`);
  }
});

test("getFreshnessNotice matches the generated JSON for both legacy subjects, and returns undefined for others", async () => {
  const records = await loadFreshness();
  const bySubject = new Map(records.map((r) => [r.legacySubject, r]));

  const testNotice = getFreshnessNotice(TEST_STANDARD_SUBJECT);
  const testRecord = bySubject.get(TEST_STANDARD_SUBJECT);
  assert.deepEqual(testNotice, { note: testRecord.note, currentStandard: testRecord.currentStandard });

  const lawNotice = getFreshnessNotice(LAW_SUBJECT);
  const lawRecord = bySubject.get(LAW_SUBJECT);
  assert.deepEqual(lawNotice, { note: lawRecord.note, currentStandard: null });

  assert.equal(getFreshnessNotice("전혀 다른 과목"), undefined);
});

test("questionId and examDate are valid and match known exam dates", async () => {
  const records = await loadFreshness();
  const manifest = JSON.parse(
    await readFile(new URL("../public/data/exams/manifest.json", import.meta.url), "utf8"),
  );
  const knownDates = new Set(manifest.map((entry) => entry.date));

  for (const record of records) {
    assert.match(record.questionId, /^\d{8}-\d{3}$/);
    assert.match(record.examDate, /^\d{8}$/);
    assert.ok(knownDates.has(record.examDate), `unknown examDate ${record.examDate}`);
    assert.ok(record.questionId.startsWith(`${record.examDate}-`));
  }
});

test("source does not use labels or keyPoint fields when building freshness records", async () => {
  const source = await readFile(new URL("../scripts/build-freshness.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.labels\b/);
  assert.doesNotMatch(source, /\.keyPoint\b/);
});

test("quiz-app does not statically import the 880-record freshness.json bundle", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /freshness\.json/);
  assert.match(source, /getFreshnessNotice/);
});

test("quiz-app renders the current-standard link conditionally, not unconditionally", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");
  assert.match(source, /freshness\.currentStandard\s*&&/);
});

test("generator is deterministic: running it twice produces byte-identical output", async () => {
  const outputPath = new URL("../public/data/freshness.json", import.meta.url);
  const before = await readFile(outputPath, "utf8");

  await execFileAsync("node", ["scripts/build-freshness.mjs"], {
    cwd: new URL("..", import.meta.url),
  });
  const after = await readFile(outputPath, "utf8");

  assert.equal(after, before);
});
