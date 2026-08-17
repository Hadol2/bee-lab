import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_PASS_RULE,
  CURRENT_SUBJECTS,
  CURRENT_SYLLABUS_PERIOD,
} from "../lib/current-syllabus.ts";

test("T1: current syllabus has 4 subjects totaling 80 questions", () => {
  assert.equal(CURRENT_SUBJECTS.length, 4);
  assert.equal(
    CURRENT_SUBJECTS.reduce((sum, subject) => sum + subject.questionCount, 0),
    80,
  );
});

test("T1: syllabus period and pass rule constants match the verified Q-Net rules", () => {
  assert.deepEqual(CURRENT_SYLLABUS_PERIOD, { start: "2026-01-01", end: "2030-12-31" });
  assert.deepEqual(CURRENT_PASS_RULE, { perSubjectMin: 40, averageMin: 60 });
});

test("T1 (deploy gate): every subject requires official-file provenance", () => {
  // This assertion is expected to FAIL until an operator places the official
  // Q-Net 출제기준 첨부파일 in sources/ and the subjects are re-extracted from
  // it. It must not be made to pass by relaxing the provenance value.
  assert.ok(
    CURRENT_SUBJECTS.every((subject) => subject.provenance === "official-file"),
    "신 4과목 명칭/구성이 공식 출제기준 파일로 확정되기 전까지는 실패해야 하는 배포 차단 게이트입니다.",
  );
});
