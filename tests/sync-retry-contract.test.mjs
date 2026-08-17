import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GET failure surfaces an error state without a blind PUT, and offers visible retry", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /\.catch\(\(\) => \{\s*if \(active\) setSyncState\("error"\);\s*\}\)/);
  assert.match(source, /function retrySync\(\)/);
  assert.match(source, /<button className="sync-retry" onClick=\{retrySync\}>다시 시도<\/button>/);
  assert.match(
    source,
    /<button className="sync-retry" onClick=\{retrySync\}>동기화 다시 시도<\/button>/,
  );
});

test("first sync merges local+server state and marks completion only after a successful PUT", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /resolveSyncedWrongIds\(isFirstSync, local, remote\.wrongIds/);
  assert.match(source, /pendingFirstSyncAccountIdRef\.current = isFirstSync \? initialUser\.id : null/);
  assert.match(
    source,
    /withCompletedFirstSync\(pending, completedIds\)/,
  );
  assert.match(
    source,
    /window\.localStorage\.setItem\(\s*FIRST_SYNC_STORAGE_KEY,\s*JSON\.stringify\(withCompletedFirstSync\(pending, completedIds\)\),\s*\);/,
  );
});

test("PUT failure keeps sync retryable and does not falsely mark first sync complete", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(sequence === syncSequenceRef\.current\) setSyncState\("synced"\)/);
  assert.match(source, /if \(sequence === syncSequenceRef\.current\) setSyncState\("error"\)/);
  assert.match(source, /if \(pending && sequence === syncSequenceRef\.current\)/);
});

test("PUT requests are serialized so an older slow response cannot overwrite newer local state", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /const operation = syncQueueRef\.current\.then\(async \(\) =>/);
  assert.match(source, /syncQueueRef\.current = operation\.then\(\(\) => undefined, \(\) => undefined\)/);
  assert.match(source, /const sequence = \+\+syncSequenceRef\.current/);
});

test("a changed account cannot receive the previous account's local state before its own GET", async () => {
  const source = await readFile(new URL("../app/quiz-app.tsx", import.meta.url), "utf8");

  assert.match(source, /syncAccountIdRef\.current = null/);
  assert.match(source, /syncAccountIdRef\.current = initialUser\.id/);
  assert.match(source, /syncAccountIdRef\.current !== initialUser\.id/);
});
