import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absorbDrafts, emptyJournal, mergeJournals, parseDrafts, parseJournal, serializeJournal } from '../src/core/document.js';
import { entry } from './support.js';

const journal = (patch) => ({ ...emptyJournal(), ...patch });

test('journal.json round trip; a missing file is an empty library', () => {
  const j = journal({ entries: [entry({ author: 'kin' })], kinNames: { 'kin-a': 'Alexi' } });
  assert.deepEqual(parseJournal(serializeJournal(j)), j);
  assert.deepEqual(parseJournal(null).entries, []);
});

test('a damaged or foreign journal.json throws instead of starting over', () => {
  assert.throws(() => parseJournal('{oops'));
  assert.throws(() => parseJournal('{"schema":"other"}'));
});

test('malformed entries are dropped, the rest kept', () => {
  assert.equal(parseJournal(JSON.stringify({ ...emptyJournal(), entries: [entry(), { id: 'bad' }] })).entries.length, 1);
});

test('merge: newest edit wins, both sides kept, order does not matter', () => {
  const base = entry({ title: 'A', updatedAt: '2026-01-01T00:00:00.000Z' });
  const newer = { ...base, title: 'A2', updatedAt: '2026-01-02T00:00:00.000Z' };
  const other = entry({ title: 'B' });
  const m = mergeJournals(journal({ entries: [base, other] }), journal({ entries: [newer] }));
  assert.deepEqual(m.entries.map((e) => e.title).sort(), ['A2', 'B']);
  assert.deepEqual(mergeJournals(journal({ entries: [newer] }), journal({ entries: [base, other] })).entries, m.entries);
});

test('merge: a deletion beats older copies, not later edits; old tombstones go', () => {
  const base = entry({ updatedAt: '2026-01-01T00:00:00.000Z' });
  const gone = journal({ deleted: { [base.id]: '2026-01-05T00:00:00.000Z' } });
  const now = new Date('2026-01-10T00:00:00Z');
  assert.deepEqual(mergeJournals(journal({ entries: [base] }), gone, now).entries, []);
  assert.equal(mergeJournals(journal({ entries: [{ ...base, updatedAt: '2026-01-06T00:00:00.000Z' }] }), gone, now).entries.length, 1);
  assert.deepEqual(mergeJournals(gone, journal({}), new Date('2027-01-01')).deleted, {});
});

test('drafts: only the ones never seen are taken in; a broken file is no drafts', () => {
  const kept = entry();
  const deleted = entry();
  const fresh = entry({ author: 'kin' });
  const { added } = absorbDrafts(journal({ entries: [kept], deleted: { [deleted.id]: new Date().toISOString() } }), [kept, deleted, fresh]);
  assert.deepEqual(added.map((e) => e.id), [fresh.id]);
  assert.deepEqual(parseDrafts('nope'), []);
});
