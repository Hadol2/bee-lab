import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'build-formula-cards.mjs');
const OUTPUT_PATH = path.join(ROOT, 'public', 'data', 'formula-cards.json');
const ERRATA_PATH = path.join(ROOT, 'public', 'data', 'question-errata.json');
const MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'exams', 'manifest.json');
const EXAMS_DIR = path.join(ROOT, 'public', 'data', 'exams');

const FORBIDDEN_REF = /comcbt|\.pdf|source-links?/i;
const QUESTION_ID_RE = /^\d{8}-\d{3}$/;

function runGenerator() {
  execFileSync('node', [SCRIPT_PATH], { cwd: ROOT, stdio: 'pipe' });
}

async function loadRealQuestionIds() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const entries = Array.isArray(manifest) ? manifest : manifest.exams || [];
  const validIds = new Set();

  for (const entry of entries) {
    const rawFile = typeof entry === 'string' ? entry : entry.file || `${entry.id || entry.date}.json`;
    const file = rawFile.endsWith('.json') ? rawFile : `${rawFile}.json`;
    const date = path.basename(file, '.json');
    const examData = JSON.parse(await readFile(path.join(EXAMS_DIR, file), 'utf8'));
    const list = Array.isArray(examData) ? examData : examData.questions || examData.items || [];
    for (const q of list) {
      if (q == null) continue;
      const rawId = q.id ?? q.number ?? q.no;
      if (rawId == null) continue;
      const rawStr = String(rawId);
      if (QUESTION_ID_RE.test(rawStr)) {
        validIds.add(rawStr);
      } else {
        const numeric = rawStr.replace(/\D/g, '');
        if (numeric) validIds.add(`${date}-${numeric.padStart(3, '0')}`);
      }
    }
  }
  return validIds;
}

test('generator produces deterministic output across runs', async () => {
  runGenerator();
  const first = await readFile(OUTPUT_PATH, 'utf8');
  runGenerator();
  const second = await readFile(OUTPUT_PATH, 'utf8');
  assert.equal(first, second);
});

test('formula-cards.json has exactly 20 well-formed cards', async () => {
  runGenerator();
  const cards = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));

  assert.equal(cards.length, 20);

  const ids = new Set();
  for (const card of cards) {
    assert.equal(ids.has(card.id), false, `중복 카드 id: ${card.id}`);
    ids.add(card.id);

    assert.ok(card.title);
    assert.ok(card.formula);
    assert.ok(Array.isArray(card.variables) && card.variables.length > 0);
    for (const v of card.variables) {
      assert.ok(v.symbol && v.meaning && v.unit);
    }
    assert.ok(Array.isArray(card.assumptions) && card.assumptions.length > 0);
    assert.ok(card.worked && card.worked.given && card.worked.result);
    assert.ok(Array.isArray(card.worked.steps) && card.worked.steps.length > 0);
    assert.ok(Array.isArray(card.commonTraps) && card.commonTraps.length > 0);
    assert.ok(card.citation && card.citation.type && card.citation.ref);
    assert.equal(FORBIDDEN_REF.test(card.citation.ref), false, `금지된 출처 참조: ${card.id}`);
    assert.equal(card.reviewStatus, 'machine_checked');
    assert.ok(Array.isArray(card.questionIds) && card.questionIds.length > 0);
    for (const qid of card.questionIds) {
      assert.match(qid, QUESTION_ID_RE);
    }
  }
});

test('all questionIds reference real questions across exam data', async () => {
  const validIds = await loadRealQuestionIds();
  runGenerator();
  const cards = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  for (const card of cards) {
    for (const qid of card.questionIds) {
      assert.ok(validIds.has(qid), `존재하지 않는 questionId: ${qid}`);
    }
  }
});

test('question-errata.json exists with a valid array schema', async () => {
  runGenerator();
  const errata = JSON.parse(await readFile(ERRATA_PATH, 'utf8'));
  assert.ok(Array.isArray(errata));
});

test('generator source avoids forbidden .labels/keyPoint fields', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.equal(/\.labels\b/.test(source), false);
  assert.equal(/keyPoint/.test(source), false);
});
