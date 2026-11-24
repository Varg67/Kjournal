import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFTS_FILE, JOURNAL_FILE } from '../src/core/constants.js';
import { emptyJournal, parseDrafts, serializeJournal } from '../src/core/document.js';
import { runProgram } from '../run/program.js';
import { entry, memoryKin } from './support.js';

const save = (input, kin = 'kin-a') => ({ trigger: 'action', action: 'save_journal_entry', kin, input });
const read = (query, kin = 'kin-a') => ({ trigger: 'action', action: 'read_journal', kin, input: { query } });

test('save_journal_entry writes a Kin draft to kin-drafts.json, never journal.json', async () => {
  const kin = memoryKin();
  const out = await runProgram({ event: save({ title: 'Cabin', entry: 'Rain and Alexi spent a night at the cabin.', keyphrases: ['night at the cabin', ' Night at the Cabin '] }), kin });
  assert.equal(out.ok, true);
  assert.ok(!kin.files.has(JOURNAL_FILE));
  const [d] = parseDrafts(kin.files.get(DRAFTS_FILE));
  assert.deepEqual([d.kinId, d.scope, d.status, d.author, d.keyphrases], ['kin-a', 'kin', 'draft', 'kin', ['night at the cabin']]);
});

test('global entries; invalid ones fail with the reason', async () => {
  const kin = memoryKin();
  assert.equal((await runProgram({ event: save({ title: 'Solara', entry: 'Solara is a seaside town in the south.', keyphrases: ['Solara'], global: true }), kin })).ok, true);
  assert.equal(parseDrafts(kin.files.get(DRAFTS_FILE))[0].kinId, null);
  const bad = await runProgram({ event: save({ entry: '', keyphrases: [] }), kin });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /^Not saved/);
});

test('the same text is not saved twice; drafts already taken in are dropped', async () => {
  const absorbed = entry({ content: 'Already in the journal.' });
  const kin = memoryKin({ [JOURNAL_FILE]: serializeJournal({ ...emptyJournal(), entries: [absorbed] }), [DRAFTS_FILE]: JSON.stringify({ entries: [absorbed] }) });
  assert.match((await runProgram({ event: save({ entry: 'already in the JOURNAL.', keyphrases: ['something'] }), kin })).message, /already in the journal/);
  await runProgram({ event: save({ entry: 'A new fact about Alexi.', keyphrases: ['new fact'] }), kin });
  assert.deepEqual(parseDrafts(kin.files.get(DRAFTS_FILE)).map((d) => d.content), ['A new fact about Alexi.']);
});

test('a damaged journal.json stops the run without writing anything', async () => {
  const kin = memoryKin({ [JOURNAL_FILE]: '{broken' });
  await assert.rejects(runProgram({ event: save({ entry: 'Some text that is long enough.', keyphrases: ['abc'] }), kin }));
  assert.ok(!kin.files.has(DRAFTS_FILE));
});

test('read_journal: this Kin and globals only, drafts included', async () => {
  const kin = memoryKin({ [JOURNAL_FILE]: serializeJournal({ ...emptyJournal(), entries: [
    entry({ title: 'Cabin', content: 'The night at the cabin.', keyphrases: ['cabin'], status: 'inKindroid' }),
    entry({ kinId: 'kin-b', title: 'Another Kin secret', content: 'Must not show.', keyphrases: ['cabin'] }),
    entry({ scope: 'global', kinId: null, title: 'Solara', content: 'A seaside town.', keyphrases: ['Solara'] }),
  ] }) });
  const out = await runProgram({ event: read('cabin'), kin });
  assert.ok(out.message.includes('Cabin (in your Kindroid journal'));
  assert.ok(!out.message.includes('secret'));
  await runProgram({ event: save({ title: 'Lighthouse', entry: 'The Solara lighthouse still works.', keyphrases: ['lighthouse'] }), kin });
  assert.ok((await runProgram({ event: read('lighthouse'), kin })).message.includes('Lighthouse (draft'));
  assert.match((await runProgram({ event: read('xyzzy'), kin })).message, /^Nothing in the journal/);
});

test('other triggers are refused', async () => {
  assert.equal((await runProgram({ event: { trigger: 'schedule' }, kin: memoryKin() })).ok, false);
  assert.equal((await runProgram({ event: { trigger: 'action', action: 'nope' }, kin: memoryKin() })).ok, false);
});
