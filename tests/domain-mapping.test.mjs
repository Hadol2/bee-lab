import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadAllQuestionIds() {
  const manifest = JSON.parse(
    await readFile(new URL("../public/data/exams/manifest.json", import.meta.url), "utf8"),
  );
  const exams = await Promise.all(
    manifest.map(async (summary) => {
      const payload = JSON.parse(
        await readFile(new URL(`../public${summary.dataUrl}`, import.meta.url), "utf8"),
      );
      return payload.questions.map((question) => question.id);
    }),
  );
  return exams.flat();
}

async function loadMapping() {
  return JSON.parse(
    await readFile(new URL("../public/data/domain-mapping.json", import.meta.url), "utf8"),
  );
}

test("T2: mapping is generated from `subject`/`text`/`choices` only, never from `labels`/`keyPoint`/`answer`", async () => {
  const script = await readFile(
    new URL("../scripts/build-domain-mapping.mjs", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(script, /\.labels\b/);
  assert.doesNotMatch(script, /\.keyPoint\b/);
  assert.doesNotMatch(script, /\.answer\b/);
  assert.match(script, /question\.subject/);
  assert.match(script, /question\.text/);
});

test("T2: domain-mapping.json accounts for exactly the 2,200 exam questions once each", async () => {
  const [ids, mapping] = await Promise.all([loadAllQuestionIds(), loadMapping()]);

  assert.equal(mapping.version, 2);
  assert.equal(mapping.records.length, 2200);
  const mappedIds = mapping.records.map((record) => record.questionId);
  assert.equal(new Set(mappedIds).size, 2200);
  assert.deepEqual(new Set(mappedIds), new Set(ids));
});

test("T2: every current-subject has at least 20 eligibleForCurrentMock questions", async () => {
  const mapping = await loadMapping();
  const bySubject = new Map([
    ["subject-1", 0],
    ["subject-2", 0],
    ["subject-3", 0],
    ["subject-4", 0],
  ]);
  for (const record of mapping.records) {
    if (record.eligibleForCurrentMock) {
      bySubject.set(record.currentSubjectKey, bySubject.get(record.currentSubjectKey) + 1);
    }
  }
  for (const [subjectId, count] of bySubject) {
    assert.ok(count >= 20, `${subjectId} has only ${count} eligible questions`);
  }
});

test("T2: eligibleForCurrentMock requires auto_confirmed, non-freshness-gated, and a full major+minor hierarchy", async () => {
  const mapping = await loadMapping();
  for (const record of mapping.records) {
    if (record.eligibleForCurrentMock) {
      assert.equal(record.reviewStatus, "auto_confirmed", record.questionId);
      assert.equal(record.freshnessGated, false, record.questionId);
      assert.notEqual(record.currentSubjectKey, null, record.questionId);
      assert.notEqual(record.majorId, null, record.questionId);
      assert.notEqual(record.minorId, null, record.questionId);
    }
  }
});

test("T2: 「폐기물 관계 법규」 is always subject-1/major-2/minor-3, freshness-gated, and ineligible", async () => {
  const mapping = await loadMapping();
  const lawRecords = mapping.records.filter((record) => record.legacySubject === "폐기물 관계 법규");

  assert.equal(lawRecords.length, 440);
  for (const record of lawRecords) {
    assert.equal(record.currentSubjectKey, "subject-1", record.questionId);
    assert.equal(record.majorId, "subject-1.major-2", record.questionId);
    assert.equal(record.minorId, "subject-1.major-2.minor-3", record.questionId);
    assert.equal(record.freshnessGated, true, record.questionId);
    assert.equal(record.eligibleForCurrentMock, false, record.questionId);
  }
});

test("T2: 「폐기물 공정시험기준」 is always subject-4; only explicit text rules set hierarchy/eligibility", async () => {
  const mapping = await loadMapping();
  const testStandardRecords = mapping.records.filter(
    (record) => record.legacySubject === "폐기물 공정시험기준",
  );

  assert.equal(testStandardRecords.length, 440);
  for (const record of testStandardRecords) {
    assert.equal(record.currentSubjectKey, "subject-4", record.questionId);
  }
  const structuralFallback = testStandardRecords.filter(
    (record) => record.confidence === "legacy-subject-structural",
  );
  assert.ok(structuralFallback.length > 0);
  for (const record of structuralFallback) {
    assert.equal(record.majorId, null, record.questionId);
    assert.equal(record.eligibleForCurrentMock, false, record.questionId);
  }
});

test("T2: the 「폐기물 개론」 structural-only fallback never fabricates a major/minor and is ineligible", async () => {
  const mapping = await loadMapping();
  const structuralFallback = mapping.records.filter(
    (record) => record.legacySubject === "폐기물 개론" && record.confidence === "legacy-subject-structural",
  );

  assert.ok(structuralFallback.length > 0);
  for (const record of structuralFallback) {
    assert.equal(record.currentSubjectKey, "subject-1", record.questionId);
    assert.equal(record.majorId, null, record.questionId);
    assert.equal(record.minorId, null, record.questionId);
    assert.equal(record.eligibleForCurrentMock, false, record.questionId);
  }
});

test("T2: 「폐기물 개론」 has >=20 eligible questions via explicit subject-1 text rules (수거/운반/적환장/발생량/발생원/분리배출/보관)", async () => {
  const mapping = await loadMapping();
  const eligibleIntro = mapping.records.filter(
    (record) => record.legacySubject === "폐기물 개론" && record.eligibleForCurrentMock,
  );
  assert.ok(eligibleIntro.length >= 20, `only ${eligibleIntro.length} eligible 개론 questions`);
});

test("T2: the 「폐기물 소각 및 열회수」 structural-only fallback sets no minor and is ineligible", async () => {
  const mapping = await loadMapping();
  const structuralFallback = mapping.records.filter(
    (record) =>
      record.legacySubject === "폐기물 소각 및 열회수" && record.confidence === "legacy-subject-structural",
  );

  assert.ok(structuralFallback.length > 0);
  for (const record of structuralFallback) {
    assert.equal(record.currentSubjectKey, "subject-3", record.questionId);
    assert.equal(record.minorId, null, record.questionId);
    assert.equal(record.eligibleForCurrentMock, false, record.questionId);
  }
});

test("T2: known boundary questions resolve exactly as designed", async () => {
  const mapping = await loadMapping();
  const byId = new Map(mapping.records.map((record) => [record.questionId, record]));

  // 파쇄 (text) + Rittinger/Kick/Bond (choices) conjunction redirects legacy
  // 「폐기물 개론」 questions to subject-2 size-reduction, despite the choice
  // terms alone never being allowed to redirect anything.
  for (const id of ["20210515-003", "20161001-004", "20150531-003"]) {
    const record = byId.get(id);
    assert.equal(record.currentSubjectKey, "subject-2", id);
    assert.equal(record.majorId, "subject-2.major-1", id);
    assert.equal(record.minorId, "subject-2.major-1.minor-1", id);
    assert.equal(record.eligibleForCurrentMock, true, id);
  }

  // 혐기성 + 메탄 text-only conjunction routes to anaerobic digestion detail.
  const anaerobic = byId.get("20150531-024");
  assert.equal(anaerobic.currentSubjectKey, "subject-2");
  assert.equal(anaerobic.majorId, "subject-2.major-3");
  assert.equal(anaerobic.minorId, "subject-2.major-3.minor-2");
  assert.equal(anaerobic.detailId, "subject-2.major-3.minor-2.detail-1");
  assert.equal(anaerobic.eligibleForCurrentMock, true);

  // A conflicting-explicit-keyword case must stay unmapped/needs_review, not
  // be silently forced into one subject.
  const conflicting = byId.get("20150531-011");
  assert.equal(conflicting.confidence, "conflicting-explicit-keywords");
  assert.equal(conflicting.currentSubjectKey, null);
  assert.equal(conflicting.reviewStatus, "needs_review");
  assert.equal(conflicting.eligibleForCurrentMock, false);
});

test("T2: the generic subject-1 keywords (발생량/발생원/수거/운반/보관) never redirect other legacy subjects into subject-1 eligibility", async () => {
  const mapping = await loadMapping();
  const byId = new Map(mapping.records.map((record) => [record.questionId, record]));

  // Cake/CO2 generation and 수거분뇨 digestion questions from non-「폐기물
  // 개론」 legacy subjects must not become subject-1 eligible on the back of
  // these generic terms, or they'd conflict with the valid anaerobic/landfill
  // classification those questions actually belong to.
  for (const id of ["20160508-036", "20161001-021", "20200926-052", "20220305-037"]) {
    const record = byId.get(id);
    assert.notEqual(record.currentSubjectKey, "subject-1", id);
    assert.equal(record.eligibleForCurrentMock === true && record.currentSubjectKey === "subject-1", false, id);
  }
});

test("T2: known post-fix boundary questions resolve to their correct subject", async () => {
  const mapping = await loadMapping();
  const byId = new Map(mapping.records.map((record) => [record.questionId, record]));

  for (const id of ["20160306-024", "20160306-033"]) {
    const record = byId.get(id);
    assert.equal(record.currentSubjectKey, "subject-3", id);
  }
  for (const id of ["20160508-027", "20160508-034"]) {
    const record = byId.get(id);
    assert.equal(record.currentSubjectKey, "subject-2", id);
  }
});

test("T2: 20150531-007 (Dulong 저위발열량) maps to subject-3/major-1/minor-1 and is eligible", async () => {
  const mapping = await loadMapping();
  const byId = new Map(mapping.records.map((record) => [record.questionId, record]));
  const record = byId.get("20150531-007");
  assert.equal(record.currentSubjectKey, "subject-3");
  assert.equal(record.majorId, "subject-3.major-1");
  assert.equal(record.minorId, "subject-3.major-1.minor-1");
  assert.equal(record.reviewStatus, "auto_confirmed");
  assert.equal(record.eligibleForCurrentMock, true);
});

test("T2: 20150531-015 (슬러지 탈수, ambiguous subject-2 vs subject-1) is null/needs_review/ineligible", async () => {
  const mapping = await loadMapping();
  const byId = new Map(mapping.records.map((record) => [record.questionId, record]));
  const record = byId.get("20150531-015");
  assert.equal(record.currentSubjectKey, null);
  assert.equal(record.majorId, null);
  assert.equal(record.minorId, null);
  assert.equal(record.reviewStatus, "needs_review");
  assert.equal(record.eligibleForCurrentMock, false);
});

test("T2: 「폐기물 관계 법규」 (440 questions) always remains subject-1/fresh-gated/ineligible", async () => {
  const mapping = await loadMapping();
  const lawRecords = mapping.records.filter((record) => record.legacySubject === "폐기물 관계 법규");
  assert.equal(lawRecords.length, 440);
  for (const record of lawRecords) {
    assert.equal(record.currentSubjectKey, "subject-1", record.questionId);
    assert.equal(record.freshnessGated, true, record.questionId);
    assert.equal(record.eligibleForCurrentMock, false, record.questionId);
  }
});

test("T2: every subject-1 eligible record originates from legacySubject 「폐기물 개론」", async () => {
  const mapping = await loadMapping();
  const subject1Eligible = mapping.records.filter(
    (record) => record.currentSubjectKey === "subject-1" && record.eligibleForCurrentMock,
  );
  assert.ok(subject1Eligible.length >= 20);
  for (const record of subject1Eligible) {
    assert.equal(record.legacySubject, "폐기물 개론", record.questionId);
  }
});

test("T2: majorId/minorId/detailId always nest under their declared currentSubjectKey per the taxonomy", async () => {
  const mapping = await loadMapping();
  const taxonomy = JSON.parse(
    await readFile(
      new URL("../public/data/qnet-official-syllabus/taxonomy.json", import.meta.url),
      "utf8",
    ),
  );
  const majorToSubject = new Map();
  const minorToMajor = new Map();
  const detailToMinor = new Map();
  for (const subject of taxonomy.subjects) {
    for (const major of subject.majors ?? []) {
      majorToSubject.set(major.id, subject.id);
      for (const minor of major.minors ?? []) {
        minorToMajor.set(minor.id, major.id);
        for (const detail of minor.details ?? []) {
          detailToMinor.set(detail.id, minor.id);
        }
      }
    }
  }

  for (const record of mapping.records) {
    if (record.majorId !== null) {
      assert.equal(majorToSubject.get(record.majorId), record.currentSubjectKey, record.questionId);
    }
    if (record.minorId !== null) {
      assert.equal(minorToMajor.get(record.minorId), record.majorId, record.questionId);
    }
    if (record.detailId !== null) {
      assert.equal(detailToMinor.get(record.detailId), record.minorId, record.questionId);
    }
  }
});

