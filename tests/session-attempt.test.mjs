import assert from "node:assert/strict";
import test from "node:test";
import {
  captureSessionAttempt,
  restoreSessionAttempt,
} from "../lib/session-attempt.ts";

test("a completed exam attempt survives an overlapping wrong-answer retry", () => {
  const examIds = ["exam-1", "exam-2", "exam-3"];
  const completed = captureSessionAttempt(
    examIds,
    { "exam-1": 0, "exam-2": 1, "exam-3": 2 },
    examIds,
    false,
  );

  const duringWrongRetry = {
    answers: { "exam-1": 3, "other-1": 1 },
    checked: ["exam-1", "other-1"],
  };
  const restored = restoreSessionAttempt(
    examIds,
    duringWrongRetry.answers,
    duringWrongRetry.checked,
    completed,
  );

  assert.deepEqual(restored.answers, {
    "other-1": 1,
    "exam-1": 0,
    "exam-2": 1,
    "exam-3": 2,
  });
  assert.deepEqual(restored.checked, ["other-1", ...examIds]);
});

test("capturing an attempt excludes answers and checks from other sessions", () => {
  assert.deepEqual(
    captureSessionAttempt(
      ["a", "b"],
      { a: 0, b: 1, outside: 2 },
      ["a", "outside"],
      true,
    ),
    { answers: { a: 0, b: 1 }, checked: ["a"], mockSubmitted: true },
  );
});
