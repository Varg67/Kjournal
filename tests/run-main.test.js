// The real `node main.js`, with a stand-in kin command: what Kindroid would run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KIN = fileURLToPath(new URL('./support/fake-kin.mjs', import.meta.url));

function run(event, { files = {}, fail } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'));
  mkdirSync(join(dir, 'files'));
  for (const [p, t] of Object.entries(files)) writeFileSync(join(dir, 'files', p), t);
  execFileSync(process.execPath, [join(ROOT, 'main.js')], { input: typeof event === 'string' ? event : JSON.stringify(event), env: { ...process.env, KIN_BIN: KIN, FAKE_KIN_DIR: dir, ...(fail ? { FAKE_KIN_FAIL: fail } : {}) } });
  const calls = readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const read = (p) => { try { return readFileSync(join(dir, 'files', p), 'utf8'); } catch { return null; } };
  return { end: JSON.parse(readFileSync(join(dir, 'end.json'), 'utf8')), calls, read };
}

const save = { trigger: 'action', action: 'save_journal_entry', kin: 'k1', input: { title: 'Marta', entry: 'Marta is Alexi\'s older sister and lives in Lisbon.', keyphrases: ['Marta', 'my sister'] } };

test('save: reads both files (missing is fine), writes the draft, ends once', () => {
  const r = run(save);
  assert.equal(r.end.failed, false);
  assert.match(r.end.message, /^Saved as a draft/);
  assert.match(r.read('kin-drafts.json'), /Marta/);
  assert.equal(r.read('journal.json'), null);
  assert.equal(r.calls.filter((c) => c[0] === 'end').length, 1);
});

test('a Kindroid failure while reading ends --failed and writes nothing', () => {
  const r = run(save, { fail: 'files' });
  assert.equal(r.end.failed, true);
  assert.match(r.end.message, /Kindroid could not be reached/);
  assert.equal(r.read('kin-drafts.json'), null);
});

test('a damaged journal.json is never written over', () => {
  const r = run(save, { files: { 'journal.json': '{broken' } });
  assert.equal(r.end.failed, true);
  assert.equal(r.read('journal.json'), '{broken');
  assert.equal(r.read('kin-drafts.json'), null);
});

test('input that is not a trigger still ends the run', () => {
  assert.equal(run('not json').end.failed, true);
});
