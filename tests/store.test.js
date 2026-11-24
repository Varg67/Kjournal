import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/screen/store.js';
import { DRAFTS_FILE, JOURNAL_FILE } from '../src/core/constants.js';
import { emptyJournal, parseJournal, serializeDrafts, serializeJournal } from '../src/core/document.js';
import { entry } from './support.js';

function fakeChannel(initial = {}) {
  const files = new Map(Object.entries(initial));
  return { files, writes: 0, read: async (p) => (files.has(p) ? files.get(p) : null), async write(p, t) { this.writes += 1; files.set(p, t); return true; } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('edits are saved to journal.json after a short delay', async () => {
  const ch = fakeChannel();
  const store = createStore(ch, { delay: 5 });
  await store.load();
  const e = store.add({ title: 'Marta', kinId: 'k1', content: 'Marta is the older sister.', keyphrases: ['Marta'] });
  store.edit(e.id, { title: 'Marta, the sister' });
  await wait(30);
  assert.equal(store.state.save, 'saved');
  assert.equal(parseJournal(ch.files.get(JOURNAL_FILE)).entries[0].title, 'Marta, the sister');
  assert.equal(ch.writes, 1);
});

test('the Kin\'s drafts are taken in and saved; another screen\'s edits are merged', async () => {
  const other = entry({ title: 'From the phone' });
  const draft = entry({ title: 'Kin draft', author: 'kin' });
  const ch = fakeChannel({ [JOURNAL_FILE]: serializeJournal({ ...emptyJournal(), entries: [other] }), [DRAFTS_FILE]: serializeDrafts([draft]) });
  const store = createStore(ch, { delay: 5 });
  const notes = [];
  store.onNotice((t) => notes.push(t));
  await store.load();
  assert.deepEqual(store.state.journal.entries.map((e) => e.title).sort(), ['From the phone', 'Kin draft']);
  assert.deepEqual(notes, ['Your Kin wrote a new draft.']);
  await wait(30);
  assert.equal(parseJournal(ch.files.get(JOURNAL_FILE)).entries.length, 2);

  // another screen deletes "From the phone" meanwhile
  const remote = parseJournal(ch.files.get(JOURNAL_FILE));
  ch.files.set(JOURNAL_FILE, serializeJournal({ ...remote, entries: remote.entries.filter((e) => e.id !== other.id), deleted: { [other.id]: new Date().toISOString() } }));
  await store.refresh();
  assert.deepEqual(store.state.journal.entries.map((e) => e.title), ['Kin draft']);
});

test('a damaged journal.json is never written over', async () => {
  const ch = fakeChannel({ [JOURNAL_FILE]: '{broken' });
  const store = createStore(ch, { delay: 5 });
  await assert.rejects(store.load());
  store.add({ content: 'x', keyphrases: ['ab'] });
  await wait(30);
  assert.equal(store.state.save, 'failed');
  assert.equal(ch.files.get(JOURNAL_FILE), '{broken');
});

test('a delete stays deleted after merging with an older copy', async () => {
  const old = entry({ updatedAt: '2026-01-01T00:00:00.000Z' });
  const ch = fakeChannel({ [JOURNAL_FILE]: serializeJournal({ ...emptyJournal(), entries: [old] }) });
  const store = createStore(ch, { delay: 5 });
  await store.load();
  store.remove(old.id);
  await wait(30);
  assert.deepEqual(parseJournal(ch.files.get(JOURNAL_FILE)).entries, []);
});
