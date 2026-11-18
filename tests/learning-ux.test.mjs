import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../app/quiz-app.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);

test("learning home exposes the three primary study paths without requiring login", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /부담 없이 시작하고,(<br \/>)? 틀린 문제까지 끝내세요/);
  assert.match(app, /과목별 \{selectedSubjectCount\}문제/);
  assert.match(app, /100문제 모의고사/);
  assert.match(app, /틀린 문제 다시 풀기/);
  assert.match(app, /로그인하지 않아도 바로 풀 수 있습니다/);
});

test("opening the learning home pauses the active session timer", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const isSessionActive =\s*!showLearningHome && !loading && !loadError/,
  );
});

test("session changes are blocked while an exam is loading and snapshots use the active set key", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /activeSessionKeyRef\.current/);
  assert.match(app, /function selectExam\(date: string\) \{\s*if \(loading\) return;/);
  assert.match(app, /async function startSubject[\s\S]*?if \(loading\) return false;/);
  assert.match(app, /startSubjectFromHome\(\)} disabled=\{loading\}/);
  assert.match(app, /startMockFromHome\(\)} disabled=\{loading\}/);
  assert.doesNotMatch(app, /writeAttemptState\(\s*sessionKey,/);
});

test("failed exam loads can retry the same session without exposing stale mobile actions", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /const \[examLoadRetry, setExamLoadRetry\] = useState\(0\)/);
  assert.match(app, /function retryCurrentExam\(\)/);
  assert.match(app, /setExamLoadRetry\(\(value\) => value \+ 1\)/);
  assert.match(app, /회차 다시 불러오기/);
  assert.match(app, /onClick=\{loadError && sourceMode === "exam" \? retryCurrentExam : openCurrentSession\}/);
  assert.match(
    app,
    /!showLearningHome && !showSessionResult && !loading && !loadError && question/,
  );
});

test("mobile quiz flow keeps the primary action visible and provides question navigation", async () => {
  const [app, css] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(app, /className="mobile-quiz-actions"/);
  assert.match(app, /aria-haspopup="dialog"/);
  assert.match(app, /aria-labelledby="question-sheet-title"/);
  assert.match(app, /className="mobile-action-primary" onClick=\{\(\) => move\(1\)\} disabled=\{!isChecked/);
  assert.match(css, /\.mobile-quiz-actions \{ position: fixed;/);
  assert.match(css, /\.question-sheet-backdrop \{ position: fixed;/);
  assert.match(app, /matchMedia\("\(min-width: 761px\)"\)/);
});

test("progress and result actions state their meaning instead of showing an unlabeled percent", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /sessionScore\.complete \? "정답률" : "진행"/);
  assert.match(app, /오답 \$\{sessionScore\.incorrect\}문제 확인/);
  assert.match(app, /다음 복습 추천/);
});

test("mobile keeps explanation provenance readable", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /\.explanation-title small \{ display: block;/);
  assert.doesNotMatch(css, /\.explanation-title small \{ display: none;/);
});
