import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSessionScore,
  calculateSubjectScores,
  calculatePassRisk,
  hasCompleteSubjectCoverage,
} from "../lib/session-score.ts";

const questions = [
  { id: "q1", answer: 0 },
  { id: "q2", answer: 1 },
  { id: "q3", answer: 2 },
];

test("calculates accuracy only when a regular set is fully checked", () => {
  const incomplete = calculateSessionScore(questions, { q1: 0 }, ["q1"]);
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.correct, 1);

  const complete = calculateSessionScore(
    questions,
    { q1: 0, q2: 1, q3: 3 },
    ["q1", "q2", "q3"],
  );
  assert.deepEqual(complete, {
    answered: 3,
    evaluated: 3,
    correct: 2,
    incorrect: 1,
    accuracy: 67,
    complete: true,
  });
});

test("counts unanswered mock questions as incorrect after submission", () => {
  const result = calculateSessionScore(questions, { q1: 0 }, [], true);
  assert.deepEqual(result, {
    answered: 1,
    evaluated: 3,
    correct: 1,
    incorrect: 2,
    accuracy: 33,
    complete: true,
  });
});

const subjectQuestions = [
  { id: "a1", subject: "A", answer: 0 },
  { id: "a2", subject: "A", answer: 1 },
  { id: "b1", subject: "B", answer: 2 },
  { id: "b2", subject: "B", answer: 3 },
];

test("groups per-subject correctness and matches the overall correct count", () => {
  const answers = { a1: 0, a2: 1, b1: 0, b2: 3 };
  const checked = ["a1", "a2", "b1", "b2"];
  const scores = calculateSubjectScores(subjectQuestions, answers, checked);

  assert.deepEqual(
    scores.map((subject) => [subject.subject, subject.correct, subject.total]),
    [
      ["A", 2, 2],
      ["B", 1, 2],
    ],
  );

  const totalCorrect = scores.reduce((sum, subject) => sum + subject.correct, 0);
  assert.equal(totalCorrect, calculateSessionScore(subjectQuestions, answers, checked).correct);
});

test("treats blank submitted mock answers as incorrect per subject", () => {
  const scores = calculateSubjectScores(
    [
      { id: "a1", subject: "A", answer: 0 },
      { id: "a2", subject: "A", answer: 1 },
    ],
    { a1: 0 },
    [],
    true,
  );
  assert.deepEqual(scores, [
    { subject: "A", correct: 1, total: 2, evaluated: 2, complete: true, score: 50 },
  ]);
});

test("pass risk flags any subject under 40 as fail-risk regardless of average", () => {
  const subjectFail = [
    { subject: "A", score: 39 },
    { subject: "B", score: 81 },
  ];
  assert.equal(calculatePassRisk(subjectFail).average, 60);
  assert.equal(calculatePassRisk(subjectFail).risk, "과락 위험");

  const subjectPass = [
    { subject: "A", score: 40 },
    { subject: "B", score: 80 },
  ];
  assert.equal(calculatePassRisk(subjectPass).average, 60);
  assert.equal(calculatePassRisk(subjectPass).risk, "합격권");
});

test("pass risk requires a 60-point average once every subject clears 40", () => {
  const averageFail = [
    { subject: "A", score: 58 },
    { subject: "B", score: 60 },
  ];
  assert.equal(calculatePassRisk(averageFail).average, 59);
  assert.equal(calculatePassRisk(averageFail).risk, "평균 점수 보완 필요");

  const averagePass = [
    { subject: "A", score: 60 },
    { subject: "B", score: 60 },
  ];
  assert.equal(calculatePassRisk(averagePass).average, 60);
  assert.equal(calculatePassRisk(averagePass).risk, "합격권");
});

test("pass signal requires all five distinct official subject results", () => {
  const officialSubjects = ["A", "B", "C", "D", "E"];
  assert.equal(hasCompleteSubjectCoverage([{ subject: "A" }], officialSubjects), false);
  assert.equal(
    hasCompleteSubjectCoverage(
      ["A", "B", "C", "D", "E"].map((subject) => ({ subject })),
      officialSubjects,
    ),
    true,
  );
  assert.equal(
    hasCompleteSubjectCoverage(
      ["A", "A", "B", "C", "D"].map((subject) => ({ subject })),
      officialSubjects,
    ),
    false,
  );
  assert.equal(
    hasCompleteSubjectCoverage(
      ["A", "B", "C", "D", "X"].map((subject) => ({ subject })),
      officialSubjects,
    ),
    false,
  );
});
