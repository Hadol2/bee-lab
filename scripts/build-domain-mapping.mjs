import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url);
const MANIFEST_URL = new URL("public/data/exams/manifest.json", ROOT);
const TAXONOMY_URL = new URL("public/data/qnet-official-syllabus/taxonomy.json", ROOT);
const OUTPUT_URL = new URL("public/data/domain-mapping.json", ROOT);

// This script must never build mapping evidence from `labels`, `keyPoint`, or
// `answer` — those are either untrustworthy regex-derived heuristics
// (labels/keyPoint) or answer-key data that must stay out of the
// classification path (answer). Only `question.id`, `question.subject`,
// `question.text`, and `question.choices` may be read for evidence. This is
// enforced by a source-scan test (tests/domain-mapping.test.mjs), not at
// runtime here.

// ---------------------------------------------------------------------------
// Ambiguous terms: these appear in the syllabus under more than one plausible
// major/minor, so a bare hit is never enough evidence on its own to resolve a
// mapping. They are only ever recorded as informational evidence.
// ---------------------------------------------------------------------------
const AMBIGUOUS_TERMS = [
  "열분해",
  "고형화",
  "응집",
  "침전",
  "탈수",
  "건조",
  "압축",
  "파쇄",
  "선별",
  "소화",
];

// Explicit (unambiguous) keyword -> target taxonomy node. Only scanned against
// `question.text` (never `question.choices`, which are dominated by generic
// distractor terms that must not drive classification).
const EXPLICIT_KEYWORDS = [
  // --- subject-1: 폐기물개론 (수거·운반 / 발생 현황) ---
  // 발생량/발생원/수거/운반/보관 are too generic to hold across every legacy
  // subject (they also appear incidentally in energy/생물학적 처리 and 분뇨
  // treatment questions), so they are scoped to the legacy subject they were
  // actually written for: 폐기물 개론.
  { term: "발생량", subjectId: "subject-1", majorId: "subject-1.major-1", minorId: "subject-1.major-1.minor-2", legacySubject: "폐기물 개론" },
  { term: "발생원", subjectId: "subject-1", majorId: "subject-1.major-1", minorId: "subject-1.major-1.minor-1", legacySubject: "폐기물 개론" },
  { term: "분리배출", subjectId: "subject-1", majorId: "subject-1.major-4", minorId: "subject-1.major-4.minor-1" },
  { term: "보관", subjectId: "subject-1", majorId: "subject-1.major-4", minorId: "subject-1.major-4.minor-1", legacySubject: "폐기물 개론" },
  { term: "수거", subjectId: "subject-1", majorId: "subject-1.major-4", minorId: "subject-1.major-4.minor-2", legacySubject: "폐기물 개론" },
  { term: "운반", subjectId: "subject-1", majorId: "subject-1.major-4", minorId: "subject-1.major-4.minor-2", legacySubject: "폐기물 개론" },
  { term: "적환장", subjectId: "subject-1", majorId: "subject-1.major-4", minorId: "subject-1.major-4.minor-3" },
  // --- subject-2: 재활용 및 자원화 ---
  { term: "RDF", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-2" },
  { term: "Rittinger", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-1" },
  { term: "리팅거", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-1" },
  { term: "Kick", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-1" },
  { term: "킥의 법칙", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-1" },
  { term: "Bond", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-1" },
  { term: "본드의 법칙", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: "subject-2.major-1.minor-1" },
  { term: "혐기성 소화", subjectId: "subject-2", majorId: "subject-2.major-3", minorId: "subject-2.major-3.minor-2", detailId: "subject-2.major-3.minor-2.detail-1" },
  { term: "혐기성소화", subjectId: "subject-2", majorId: "subject-2.major-3", minorId: "subject-2.major-3.minor-2", detailId: "subject-2.major-3.minor-2.detail-1" },
  { term: "퇴비화", subjectId: "subject-2", majorId: "subject-2.major-3", minorId: "subject-2.major-3.minor-1", detailId: "subject-2.major-3.minor-1.detail-1" },
  { term: "사료화", subjectId: "subject-2", majorId: "subject-2.major-3", minorId: "subject-2.major-3.minor-3" },
  { term: "자원회수", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: null },
  { term: "자원화", subjectId: "subject-2", majorId: "subject-2.major-1", minorId: null },
  // --- subject-3: 처분 기술 ---
  { term: "소각로", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-4" },
  { term: "소각", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-3" },
  { term: "매립", subjectId: "subject-3", majorId: "subject-3.major-2", minorId: "subject-3.major-2.minor-1" },
  { term: "침출수", subjectId: "subject-3", majorId: "subject-3.major-2", minorId: "subject-3.major-2.minor-1" },
  { term: "연소가스", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-6" },
  { term: "배기가스", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-6" },
  { term: "폐열 회수", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-7" },
  { term: "폐열회수", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-7" },
  { term: "열회수", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-7" },
  { term: "Dulong", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-1" },
  { term: "듀롱", subjectId: "subject-3", majorId: "subject-3.major-1", minorId: "subject-3.major-1.minor-1" },
  // --- subject-4: 공정 시험기준 ---
  { term: "시료채취", subjectId: "subject-4", majorId: "subject-4.major-2", minorId: "subject-4.major-2.minor-1" },
  { term: "시료 채취", subjectId: "subject-4", majorId: "subject-4.major-2", minorId: "subject-4.major-2.minor-1" },
  { term: "기기분석", subjectId: "subject-4", majorId: "subject-4.major-3", minorId: null },
  { term: "자외선/가시선분광법", subjectId: "subject-4", majorId: "subject-4.major-3", minorId: "subject-4.major-3.minor-1" },
  { term: "원자흡수분광", subjectId: "subject-4", majorId: "subject-4.major-3", minorId: "subject-4.major-3.minor-2" },
  { term: "유도결합플라즈마", subjectId: "subject-4", majorId: "subject-4.major-3", minorId: "subject-4.major-3.minor-3" },
  { term: "기체크로마토그래피", subjectId: "subject-4", majorId: "subject-4.major-3", minorId: "subject-4.major-3.minor-4" },
  { term: "이온전극법", subjectId: "subject-4", majorId: "subject-4.major-3", minorId: "subject-4.major-3.minor-5" },
  { term: "유해성 시험", subjectId: "subject-4", majorId: "subject-4.major-2", minorId: "subject-4.major-2.minor-6", detailId: "subject-4.major-2.minor-6.detail-1" },
  { term: "유해특성", subjectId: "subject-4", majorId: "subject-4.major-2", minorId: "subject-4.major-2.minor-6", detailId: "subject-4.major-2.minor-6.detail-1" },
  { term: "용출시험", subjectId: "subject-4", majorId: "subject-4.major-2", minorId: "subject-4.major-2.minor-5" },
];

// Conjunction rules: a redirect only fires when every listed term is present,
// which rules out a single generic/distractor term deciding the outcome on
// its own. `choiceTerms` conjunctions require the text term plus at least one
// matching choice term (distractors alone still can't decide anything).
const TEXT_ONLY_CONJUNCTIONS = [
  {
    id: "anaerobic-methane",
    terms: ["혐기성", "메탄"],
    subjectId: "subject-2",
    majorId: "subject-2.major-3",
    minorId: "subject-2.major-3.minor-2",
    detailId: "subject-2.major-3.minor-2.detail-1",
  },
];

const TEXT_CHOICE_CONJUNCTIONS = [
  {
    id: "size-reduction-law",
    textTerm: "파쇄",
    choiceTerms: ["Rittinger", "Rittingger", "Kick", "Bond"],
    subjectId: "subject-2",
    majorId: "subject-2.major-1",
    minorId: "subject-2.major-1.minor-1",
  },
];

const LEGACY_SUBJECTS = {
  "폐기물 개론": {
    subjectId: "subject-1",
    majorId: null,
    minorId: null,
    protectedLegacy: false,
    freshnessGated: false,
  },
  "폐기물 처리 기술": {
    subjectId: null,
    majorId: null,
    minorId: null,
    protectedLegacy: false,
    freshnessGated: false,
  },
  "폐기물 소각 및 열회수": {
    subjectId: "subject-3",
    majorId: "subject-3.major-1",
    minorId: null,
    protectedLegacy: false,
    freshnessGated: false,
  },
  "폐기물 공정시험기준": {
    subjectId: "subject-4",
    majorId: null,
    minorId: null,
    protectedLegacy: true,
    freshnessGated: false,
  },
  "폐기물 관계 법규": {
    subjectId: "subject-1",
    majorId: "subject-1.major-2",
    minorId: "subject-1.major-2.minor-3",
    protectedLegacy: true,
    fixedHierarchy: true,
    freshnessGated: true,
  },
};

function findEvidence(text, term) {
  const offset = text.indexOf(term);
  return offset === -1 ? null : offset;
}

function collectTextHits(question) {
  const hits = [];
  for (const rule of EXPLICIT_KEYWORDS) {
    if (rule.legacySubject && rule.legacySubject !== question.subject) continue;
    const offset = findEvidence(question.text, rule.term);
    if (offset !== null) {
      hits.push({
        field: "text",
        term: rule.term,
        offset,
        subjectId: rule.subjectId,
        majorId: rule.majorId,
        minorId: rule.minorId,
        detailId: rule.detailId ?? null,
      });
    }
  }
  return hits;
}

function collectConjunctionHits(question) {
  const hits = [];
  for (const rule of TEXT_ONLY_CONJUNCTIONS) {
    const offsets = rule.terms.map((term) => findEvidence(question.text, term));
    if (offsets.every((offset) => offset !== null)) {
      hits.push({
        conjunctionId: rule.id,
        subjectId: rule.subjectId,
        majorId: rule.majorId,
        minorId: rule.minorId,
        detailId: rule.detailId ?? null,
        evidence: rule.terms.map((term, index) => ({
          source: "text",
          offset: offsets[index],
          matched: term,
        })),
      });
    }
  }
  for (const rule of TEXT_CHOICE_CONJUNCTIONS) {
    const textOffset = findEvidence(question.text, rule.textTerm);
    if (textOffset === null) continue;
    const matchedChoiceTerms = [];
    question.choices.forEach((choice, index) => {
      for (const choiceTerm of rule.choiceTerms) {
        const choiceOffset = findEvidence(choice, choiceTerm);
        if (choiceOffset !== null) {
          matchedChoiceTerms.push({ source: `choices[${index}]`, offset: choiceOffset, matched: choiceTerm });
        }
      }
    });
    if (matchedChoiceTerms.length > 0) {
      hits.push({
        conjunctionId: rule.id,
        subjectId: rule.subjectId,
        majorId: rule.majorId,
        minorId: rule.minorId,
        detailId: rule.detailId ?? null,
        evidence: [{ source: "text", offset: textOffset, matched: rule.textTerm }, ...matchedChoiceTerms],
      });
    }
  }
  return hits;
}

function collectAmbiguousHits(question) {
  const hits = [];
  const fields = [
    { name: "text", value: question.text },
    ...question.choices.map((choice, index) => ({ name: `choices[${index}]`, value: choice })),
  ];
  for (const term of AMBIGUOUS_TERMS) {
    for (const field of fields) {
      const offset = findEvidence(field.value, term);
      if (offset !== null) {
        hits.push({ field: field.name, term, offset });
      }
    }
  }
  return hits;
}

function pickBestHit(hits, targetSubjectId) {
  const candidates = hits.filter((h) => h.subjectId === targetSubjectId);
  const byDepth = [...candidates].sort((a, b) => {
    const depth = (h) => (h.detailId ? 3 : h.minorId ? 2 : h.majorId ? 1 : 0);
    return depth(b) - depth(a);
  });
  return byDepth[0];
}

function classifyQuestion(question) {
  const legacyRule = LEGACY_SUBJECTS[question.subject];
  if (!legacyRule) {
    throw new Error(`알 수 없는 legacySubject: ${question.subject} (${question.id})`);
  }

  // Fixed-hierarchy legacy subjects (law) never let any keyword hit, same
  // subject or not, refine their major/minor away from the fixed default.
  if (legacyRule.fixedHierarchy) {
    return {
      currentSubjectKey: legacyRule.subjectId,
      majorId: legacyRule.majorId,
      minorId: legacyRule.minorId,
      detailId: null,
      confidence: "legacy-subject-structural",
      reviewStatus: "auto_confirmed",
      evidence: [
        { source: "legacySubject", offset: null, matched: question.subject, impliesSubjectId: legacyRule.subjectId },
      ],
      conflicts: [],
      freshnessGated: Boolean(legacyRule.freshnessGated),
    };
  }

  const textHits = collectTextHits(question).map((h) => ({
    subjectId: h.subjectId,
    majorId: h.majorId,
    minorId: h.minorId,
    detailId: h.detailId,
    evidence: [{ source: h.field, offset: h.offset, matched: h.term }],
  }));
  const conjunctionHits = collectConjunctionHits(question);
  const ambiguousHits = collectAmbiguousHits(question);

  let usableHits = [...textHits, ...conjunctionHits];

  // Protected legacy subjects (law, process-test-standards) never let a
  // cross-subject keyword hit redirect them away from their fixed subject;
  // such hits are dropped silently rather than recorded as conflicts.
  if (legacyRule.protectedLegacy) {
    usableHits = usableHits.filter((h) => h.subjectId === legacyRule.subjectId);
  }

  const distinctSubjects = new Set(usableHits.map((h) => h.subjectId));

  if (distinctSubjects.size > 1) {
    const evidence = usableHits.flatMap((h) =>
      h.evidence.map((e) => ({ ...e, impliesSubjectId: h.subjectId })),
    );
    return {
      currentSubjectKey: null,
      majorId: null,
      minorId: null,
      detailId: null,
      confidence: "conflicting-explicit-keywords",
      reviewStatus: "needs_review",
      evidence,
      conflicts: [`explicit-keyword-conflict: ${[...distinctSubjects].join(" vs ")}`],
      freshnessGated: Boolean(legacyRule.freshnessGated),
    };
  }

  if (distinctSubjects.size === 1) {
    const targetSubjectId = [...distinctSubjects][0];
    const best = pickBestHit(usableHits, targetSubjectId);
    const evidence = usableHits.flatMap((h) =>
      h.evidence.map((e) => ({ ...e, impliesSubjectId: h.subjectId })),
    );
    const conflicts = [];
    const sameSubjectAsDefault = legacyRule.subjectId === targetSubjectId;
    if (legacyRule.subjectId && !sameSubjectAsDefault) {
      conflicts.push(
        `structural-default(${legacyRule.subjectId}) redirected by explicit keyword to ${targetSubjectId}`,
      );
    }
    const majorId = best.majorId ?? (sameSubjectAsDefault ? legacyRule.majorId : null);
    const minorId = best.minorId ?? (sameSubjectAsDefault ? legacyRule.minorId : null);
    return {
      currentSubjectKey: targetSubjectId,
      majorId,
      minorId,
      detailId: best.detailId ?? null,
      confidence: "explicit-keyword",
      reviewStatus: "auto_confirmed",
      evidence,
      conflicts,
      freshnessGated: Boolean(legacyRule.freshnessGated),
    };
  }

  // For legacy 폐기물 개론 only: an ambiguous hit (e.g. 탈수) with no usable
  // explicit hit means the question could belong to another subject (e.g.
  // 재활용 및 자원화's 탈수 처리), so the subject-1 structural default must
  // not auto-confirm it. Other legacy subjects (소각/공정시험/법규) keep
  // their structural default regardless of ambiguous hits.
  if (question.subject === "폐기물 개론" && ambiguousHits.length > 0) {
    return {
      currentSubjectKey: null,
      majorId: null,
      minorId: null,
      detailId: null,
      confidence: "ambiguous-term-only",
      reviewStatus: "needs_review",
      evidence: ambiguousHits.map((h) => ({ source: h.field, offset: h.offset, matched: h.term, impliesSubjectId: null })),
      conflicts: [],
      freshnessGated: Boolean(legacyRule.freshnessGated),
    };
  }

  // No usable hits: fall back to the legacy subject's fixed structural
  // default, if it has one.
  if (legacyRule.subjectId) {
    const evidence = [
      { source: "legacySubject", offset: null, matched: question.subject, impliesSubjectId: legacyRule.subjectId },
      ...ambiguousHits.map((h) => ({ source: h.field, offset: h.offset, matched: h.term, impliesSubjectId: null })),
    ];
    return {
      currentSubjectKey: legacyRule.subjectId,
      majorId: legacyRule.majorId,
      minorId: legacyRule.minorId,
      detailId: null,
      confidence: "legacy-subject-structural",
      reviewStatus: "auto_confirmed",
      evidence,
      conflicts: [],
      freshnessGated: Boolean(legacyRule.freshnessGated),
    };
  }

  // Legacy subject with no structural default (폐기물 처리 기술) and no
  // explicit-keyword hits. Ambiguous hits alone cannot resolve the mapping.
  if (ambiguousHits.length > 0) {
    return {
      currentSubjectKey: null,
      majorId: null,
      minorId: null,
      detailId: null,
      confidence: "ambiguous-term-only",
      reviewStatus: "needs_review",
      evidence: ambiguousHits.map((h) => ({ source: h.field, offset: h.offset, matched: h.term, impliesSubjectId: null })),
      conflicts: [],
      freshnessGated: Boolean(legacyRule.freshnessGated),
    };
  }

  return {
    currentSubjectKey: null,
    majorId: null,
    minorId: null,
    detailId: null,
    confidence: "none",
    reviewStatus: "unmapped",
    evidence: [],
    conflicts: [],
    freshnessGated: Boolean(legacyRule.freshnessGated),
  };
}

function buildTaxonomyIndex(taxonomy) {
  const subjectIds = new Set();
  const majorIds = new Map();
  const minorIds = new Map();
  const detailIds = new Map();
  for (const subject of taxonomy.subjects) {
    subjectIds.add(subject.id);
    for (const major of subject.majors ?? []) {
      majorIds.set(major.id, subject.id);
      for (const minor of major.minors ?? []) {
        minorIds.set(minor.id, major.id);
        for (const detail of minor.details ?? []) {
          detailIds.set(detail.id, minor.id);
        }
      }
    }
  }
  return { subjectIds, majorIds, minorIds, detailIds };
}

function validateHierarchy(record, index) {
  const { questionId, currentSubjectKey, majorId, minorId, detailId } = record;
  if (currentSubjectKey !== null && !index.subjectIds.has(currentSubjectKey)) {
    throw new Error(`알 수 없는 currentSubjectKey: ${currentSubjectKey} (${questionId})`);
  }
  if (majorId !== null) {
    if (!index.majorIds.has(majorId)) {
      throw new Error(`알 수 없는 majorId: ${majorId} (${questionId})`);
    }
    if (index.majorIds.get(majorId) !== currentSubjectKey) {
      throw new Error(`majorId의 상위 subject 불일치: ${majorId} (${questionId})`);
    }
  }
  if (minorId !== null) {
    if (!index.minorIds.has(minorId)) {
      throw new Error(`알 수 없는 minorId: ${minorId} (${questionId})`);
    }
    if (majorId === null || index.minorIds.get(minorId) !== majorId) {
      throw new Error(`minorId의 상위 major 불일치: ${minorId} (${questionId})`);
    }
  }
  if (detailId !== null) {
    if (!index.detailIds.has(detailId)) {
      throw new Error(`알 수 없는 detailId: ${detailId} (${questionId})`);
    }
    if (minorId === null || index.detailIds.get(detailId) !== minorId) {
      throw new Error(`detailId의 상위 minor 불일치: ${detailId} (${questionId})`);
    }
  }
}

async function loadAllQuestions() {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  const examFiles = await Promise.all(
    manifest.map(async (summary) => {
      const url = new URL(`public${summary.dataUrl}`, ROOT);
      const raw = await readFile(url, "utf8");
      return { date: summary.date, payload: JSON.parse(raw) };
    }),
  );
  return examFiles.flatMap((f) => f.payload.questions);
}

async function main() {
  const questions = await loadAllQuestions();
  if (questions.length !== 2200) {
    throw new Error(`전체 문항 수는 2200이어야 하나 ${questions.length}개입니다.`);
  }

  const taxonomy = JSON.parse(await readFile(TAXONOMY_URL, "utf8"));
  const taxonomyIndex = buildTaxonomyIndex(taxonomy);

  const records = [];
  const eligibleCountBySubject = new Map();
  for (const subjectId of taxonomyIndex.subjectIds) eligibleCountBySubject.set(subjectId, 0);

  const sortedQuestions = [...questions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const question of sortedQuestions) {
    const result = classifyQuestion(question);
    const record = {
      questionId: question.id,
      legacySubject: question.subject,
      currentSubjectKey: result.currentSubjectKey,
      majorId: result.majorId,
      minorId: result.minorId,
      detailId: result.detailId,
      confidence: result.confidence,
      reviewStatus: result.reviewStatus,
      evidence: result.evidence,
      conflicts: result.conflicts,
      freshnessGated: result.freshnessGated,
    };
    validateHierarchy(record, taxonomyIndex);

    const eligibleForCurrentMock =
      record.reviewStatus === "auto_confirmed" &&
      !record.freshnessGated &&
      record.currentSubjectKey !== null &&
      record.majorId !== null &&
      record.minorId !== null;

    record.eligibleForCurrentMock = eligibleForCurrentMock;
    if (eligibleForCurrentMock) {
      eligibleCountBySubject.set(record.currentSubjectKey, eligibleCountBySubject.get(record.currentSubjectKey) + 1);
    }
    records.push(record);
  }

  for (const [subjectId, count] of eligibleCountBySubject) {
    if (count < 20) {
      throw new Error(`${subjectId}의 eligibleForCurrentMock 문항이 20개 미만입니다 (${count}개).`);
    }
  }

  const output = {
    version: 2,
    generatedAt: "2026-08-14",
    basis: "keyword-and-legacy-subject-deterministic",
    note: "이 매핑은 결정적 기계 분류 결과이며 사람에 의한 검증을 대체하지 않습니다.",
    records,
  };

  await writeFile(OUTPUT_URL, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const distribution = {};
  for (const record of records) {
    const key = `${record.currentSubjectKey ?? "null"}::${record.reviewStatus}`;
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  console.log("distribution:", JSON.stringify(distribution, null, 2));
  console.log("eligible per subject:", JSON.stringify(Object.fromEntries(eligibleCountBySubject)));
}

await main();
