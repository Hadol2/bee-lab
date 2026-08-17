import assert from "node:assert/strict";
import test from "node:test";
import {
  FIRST_SYNC_STORAGE_KEY,
  hasCompletedFirstSync,
  parseCompletedFirstSyncIds,
  resolveSyncedWrongIds,
  withCompletedFirstSync,
} from "../lib/wrong-answer-sync.ts";

test("first sync merges guest-local and server wrong ids", () => {
  const merged = resolveSyncedWrongIds(true, ["a", "b"], ["b", "c"]);
  assert.deepEqual(merged.sort(), ["a", "b", "c"]);
});

test("later sync uses server state only, so stale local deletions cannot resurrect", () => {
  const result = resolveSyncedWrongIds(false, ["a", "stale-local-only"], ["c"]);
  assert.deepEqual(result, ["c"]);
  assert.ok(!result.includes("stale-local-only"));
});

test("hasCompletedFirstSync checks per-account membership", () => {
  assert.equal(hasCompletedFirstSync("acc1", []), false);
  assert.equal(hasCompletedFirstSync("acc1", ["acc2"]), false);
  assert.equal(hasCompletedFirstSync("acc1", ["acc1", "acc2"]), true);
});

test("withCompletedFirstSync adds the account once and is idempotent", () => {
  const once = withCompletedFirstSync("acc1", []);
  assert.deepEqual(once, ["acc1"]);
  const twice = withCompletedFirstSync("acc1", once);
  assert.deepEqual(twice, ["acc1"]);
});

test("parseCompletedFirstSyncIds tolerates missing, malformed, and non-array JSON", () => {
  assert.deepEqual(parseCompletedFirstSyncIds(null), []);
  assert.deepEqual(parseCompletedFirstSyncIds("not json"), []);
  assert.deepEqual(parseCompletedFirstSyncIds(JSON.stringify({ not: "an array" })), []);
  assert.deepEqual(parseCompletedFirstSyncIds(JSON.stringify(["acc1", 42, null, "acc2"])), [
    "acc1",
    "acc2",
  ]);
});

test("first-sync storage key is namespaced and stable", () => {
  assert.equal(FIRST_SYNC_STORAGE_KEY, "waste-cbt-first-sync-v1");
});
