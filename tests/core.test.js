import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../src/core/constants.js';
import { cleanKeyphrases, validateEntry } from '../src/core/rules.js';
import { findCollisions } from '../src/core/collisions.js';
import { highlightRanges, simulateTriggers } from '../src/core/triggers.js';
import { allowedStatuses, applyEdit, duplicateEntry, setStatus } from '../src/core/entry.js';
import { filterEntries, problemIds } from '../src/core/library.js';
import { newId, nextTime } from '../src/core/text.js';
import { entry } from './support.js';

const codes = (e) => validateEntry(e).issues.map((x) => x.code);

test('a normal entry is valid', () => assert.deepEqual(validateEntry(entry()).issues, []));

test('text and one keyphrase are required', () => {
  const r = validateEntry(entry({ content: '  ', keyphrases: [] }));
  assert.equal(r.valid, false);
  assert.ok(codes(entry({ content: ' ', keyphrases: [] })).includes('content_empty'));
  assert.ok(r.issues.some((x) => x.code === 'keyphrase_none'));
});

test('current keyphrase limits: 1-8, 2-50 characters, no repeats', () => {
  assert.equal(validateEntry(entry({ keyphrases: ['ok'] })).valid, true);
  assert.ok(codes(entry({ keyphrases: ['x'] })).includes('keyphrase_too_short'));
  assert.ok(codes(entry({ keyphrases: ['a'.repeat(51)] })).includes('keyphrase_too_long'));
  assert.ok(codes(entry({ keyphrases: Array.from({ length: 9 }, (_, i) => `phrase ${i}`) })).includes('keyphrase_too_many'));
  assert.ok(codes(entry({ keyphrases: ['Cabin', ' cabin '] })).includes('keyphrase_duplicate'));
});

test('long text and common words only warn', () => {
  const r = validateEntry(entry({ content: 'a'.repeat(LIMITS.contentComfortChars + 1), keyphrases: ['casa'], kinId: null }));
  assert.equal(r.valid, true);
  for (const c of ['content_long', 'keyphrase_generic', 'kin_missing']) assert.ok(r.issues.some((x) => x.code === c), c);
});

test('cleanKeyphrases trims, collapses and drops repeats', () => {
  assert.deepEqual(cleanKeyphrases(['  a  night ', '', 'A NIGHT', 'fire']), ['a night', 'fire']);
});

test('triggers: verbatim, case-insensitive, this Kin and globals only', () => {
  const cabin = entry({ title: 'Cabin', keyphrases: ['night at the cabin'] });
  const other = entry({ title: 'Other', kinId: 'kin-b', keyphrases: ['cabin'] });
  const world = entry({ title: 'Solara', scope: 'global', kinId: null, keyphrases: ['Solara'] });
  const r = simulateTriggers('Remember that NIGHT AT THE CABIN in solara?', [cabin, other, world], 'kin-a');
  assert.deepEqual(r.individual.map((m) => m.entry.title), ['Cabin']);
  assert.deepEqual(r.global.map((m) => m.entry.title), ['Solara']);
  assert.deepEqual(simulateTriggers('the night was cold', [cabin], 'kin-a').individual, []);
  const many = [0, 1, 2, 3].map((i) => entry({ keyphrases: [`key${i}`] }));
  assert.equal(simulateTriggers('key0 key1 key2 key3', many, 'kin-a').individualOverflow, true);
});

test('highlightRanges merges overlaps', () => {
  assert.deepEqual(highlightRanges('A night at the cabin', ['night at', 'at the cabin']), [{ text: 'A ', hit: false }, { text: 'night at the cabin', hit: true }]);
});

test('collisions: same Kin and globals, exact and overlapping', () => {
  const a = entry({ title: 'A', keyphrases: ['cabin'] });
  const found = findCollisions(a, [a, entry({ title: 'B', keyphrases: ['Cabin'] }), entry({ title: 'C', keyphrases: ['night at the cabin'] }), entry({ title: 'D', kinId: 'kin-b', keyphrases: ['cabin'] }), entry({ title: 'G', scope: 'global', kinId: null, keyphrases: ['cabin'] })]);
  assert.deepEqual(found.map((c) => [c.otherTitle, c.kind]), [['B', 'exact'], ['C', 'contains'], ['G', 'exact']]);
});

test('status: ready and in Kindroid only when valid; edits make it outdated', () => {
  assert.deepEqual(allowedStatuses(entry({ keyphrases: [] })), ['draft']);
  assert.throws(() => setStatus(entry({ keyphrases: [] }), 'ready'));
  const marked = setStatus(entry(), 'inKindroid', new Date('2026-01-01T00:00:00Z'));
  assert.equal(marked.markedInKindroidAt, '2026-01-01T00:00:00.000Z');
  assert.equal(applyEdit(marked, { title: 'New title' }).status, 'inKindroid');
  assert.equal(applyEdit(marked, { tags: ['x'] }).status, 'inKindroid');
  assert.equal(applyEdit(marked, { content: `${marked.content} More.` }).status, 'outdated');
  assert.equal(applyEdit(marked, { keyphrases: ['new phrase'] }).status, 'outdated');
  const copy = duplicateEntry(marked);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.markedInKindroidAt, undefined);
});

test('ids and times', () => {
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(nextTime('2999-01-01T00:00:00.000Z', new Date('2026-01-01')), '2999-01-01T00:00:00.001Z');
});

test('filters', () => {
  const a = entry({ title: 'Marta', tags: ['family'] });
  const b = entry({ title: 'Solara', scope: 'global', kinId: null, keyphrases: ['x'] });
  const all = [a, b];
  const f = (patch) => filterEntries(all, { collection: { kind: 'all' }, query: '', status: 'all', tag: null, ...patch }, problemIds(all)).map((e) => e.title);
  assert.deepEqual(f({ query: 'MARTA' }), ['Marta']);
  assert.deepEqual(f({ collection: { kind: 'global' } }), ['Solara']);
  assert.deepEqual(f({ tag: 'family' }), ['Marta']);
  assert.deepEqual(f({ status: 'issues' }), ['Solara']);
});
