import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isDetailedExplanation, toReviewStatus } from "../lib/explanations.ts";

test("toReviewStatus narrows unknown/malformed values to unreviewed, never implying review", () => {
  assert.equal(toReviewStatus("reviewed"), "reviewed");
  assert.equal(toReviewStatus("machine_checked"), "machine_checked");
  assert.equal(toReviewStatus("unreviewed"), "unreviewed");
  assert.equal(toReviewStatus(undefined), "unreviewed");
  assert.equal(toReviewStatus(null), "unreviewed");
  assert.equal(toReviewStatus("something-else"), "unreviewed");
  assert.equal(toReviewStatus(123), "unreviewed");
});

test("isDetailedExplanation rejects malformed DB content instead of letting it become undefined UI", () => {
  assert.equal(
    isDetailedExplanation({
      summary: "정답: ① a",
      correctReason: "충분한 길이의 구체적인 정답 근거입니다.",
      calculation: null,
      examNote: null,
    }),
    true,
  );
  assert.equal(
    isDetailedExplanation({
      summary: "정답: ① a",
      correctReason: "충분한 길이의 구체적인 정답 근거입니다.",
      calculation: "1 + 1 = 2",
      examNote: null,
    }),
    true,
  );

  assert.equal(isDetailedExplanation(null), false);
  assert.equal(isDetailedExplanation(undefined), false);
  assert.equal(isDetailedExplanation("not an object"), false);
  assert.equal(isDetailedExplanation({}), false);
  assert.equal(
    isDetailedExplanation({ summary: "", correctReason: "충분한 길이의 구체적인 정답 근거입니다.", calculation: null, examNote: null }),
    false,
  );
  assert.equal(
    isDetailedExplanation({ summary: "정답", correctReason: "짧음", calculation: null, examNote: null }),
    false,
  );
  assert.equal(
    isDetailedExplanation({ summary: "x", correctReason: 5, calculation: null, examNote: null }),
    false,
  );
  assert.equal(
    isDetailedExplanation({
      summary: "x",
      correctReason: "y",
      calculation: 42,
      examNote: null,
    }),
    false,
  );
});

test("public explanation API rejects malformed cached content rather than serving it", async () => {
  const route = await readFile(
    new URL("../app/api/explanations/[questionId]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /isDetailedExplanation\(cached\[0\]\.content\)/);
  assert.match(route, /reviewStatus: toReviewStatus\(cached\[0\]\.review_status\)/);
  assert.match(route, /g\.review_status/);
});

test("UI identifies in-house explanations without exposing source PDF links", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /선택지 상세 분석/);
  assert.match(source, /자체 제작 AI 해설 · 정답표 기준 · 오류 제보 가능/);
  assert.match(source, /검수 완료 해설/);
  assert.match(source, /explanationReview === "reviewed"/);
  assert.doesNotMatch(source, /학생용 원문|정답 표시 원문|source-links/);
});

test("UI shows a neutral machine-checked label distinct from human review", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /자동 점검 해설/);
  assert.match(source, /explanationReview === "machine_checked"/);
});

test("UI labels the key-point field as machine-classified keywords, not human curation", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /키워드\(자동 분류\)/);
  assert.doesNotMatch(source, /<b>TYPE<\/b>/);
});

test("calculation only renders when a real value exists", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /detailedExplanation\.calculation && \(/);
});

test("generator schema and parsing keep calculation optional and backward compatible", async () => {
  const generator = await readFile(
    new URL("../lib/explanation-generator.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(generator, /required:\s*\["correctReason",\s*"calculation"\]/);
  assert.match(generator, /required:\s*\["correctReason"\]/);
  assert.match(
    generator,
    /typeof parsed\.calculation === "string" && parsed\.calculation\.trim\(\)\.length > 0\s*\? parsed\.calculation\s*: null/,
  );
});
