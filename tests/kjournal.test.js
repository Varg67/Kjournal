import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKJournalJson, parseKJournalText, serializeKJournalJson, serializeKJournalText, serializeMarkdown, toRecords } from '../src/core/kjournal.js';
import { buildPreview, createImportPlan, parseImportSource } from '../src/core/importing.js';
import { emptyJournal, serializeJournal } from '../src/core/document.js';
import { bytes, entry, fixture } from './support.js';

const fatal = (r) => r.diagnostics.filter((d) => d.severity === 'fatal').map((d) => d.code);
const example = () => parseKJournalText(fixture('../examples/exemplo.kjournal'));
const alexi = { id: 'kin-alexi', name: 'Alexi' };

test('KJOURNAL/2 example, escaped markers included', () => {
  const r = example();
  assert.equal(r.hasFatal, false);
  assert.equal(r.records.length, 3);
  assert.deepEqual([r.records[0].id, r.records[0].kin, r.records[0].tags], ['cabana-lareira', 'Alexi', ['memórias', 'viagens']]);
  assert.equal(r.records[1].scope, 'global');
  assert.ok(r.records[2].entry.includes('\n@@END\n'));
});

test('text and JSON examples are the same entries', () => {
  assert.deepEqual(parseKJournalJson(fixture('../examples/exemplo.kjournal.json')).records, example().records.slice(0, 2));
});

for (const [name, code] of [['invalid-missing-end', 'unexpected-eof'], ['invalid-text-outside', 'text-outside-block'], ['invalid-too-many-keyphrases', 'keyphrase_too_many'], ['invalid-global-with-kin', 'global-with-kin']]) {
  test(`rejects ${name}`, () => assert.ok(fatal(parseKJournalText(fixture(`./fixtures/${name}.kjournal`))).includes(code)));
}

test('bad signature and bad UTF-8', () => {
  assert.deepEqual(fatal(parseKJournalText(bytes('KJOURNAL/9\n'))), ['unsupported-version']);
  assert.deepEqual(fatal(parseKJournalText(bytes('hello\n'))), ['invalid-signature']);
  assert.deepEqual(fatal(parseKJournalText(new Uint8Array([0xff, 0xfe]))), ['invalid-utf8']);
});

test('KJOURNAL/1: ai_id is ignored with a warning, v2 fields are refused', () => {
  const r = parseKJournalText(fixture('./fixtures/legacy-v1.kjournal'));
  assert.equal(r.hasFatal, false);
  assert.ok(r.diagnostics.some((d) => d.code === 'legacy-ai-id'));
  assert.ok(fatal(parseKJournalText(bytes('KJOURNAL/1\n@@JOURNAL\nkin: A\n@@KEYPHRASES\n- abc\n@@ENTRY\nText.\n@@END\n'))).includes('unknown-metadata'));
});

test('round trip through text and JSON', () => {
  const entries = [entry({ kinId: alexi.id, title: 'One', content: 'Line 1\n@@END\nLine 3', keyphrases: ['one two'], tags: ['a'] }), entry({ scope: 'global', kinId: null, title: 'Two', keyphrases: ['three'] })];
  const records = toRecords(entries, (id) => (id === alexi.id ? alexi.name : undefined));
  assert.deepEqual(parseKJournalText(bytes(serializeKJournalText(records))).records, records);
  assert.deepEqual(parseKJournalJson(bytes(serializeKJournalJson(records))).records, records);
  assert.ok(serializeMarkdown(records).includes('## Alexi'));
});

test('preview: names match attached Kins; unknown Kins are never created', () => {
  const p = buildPreview(example(), { kins: [{ id: 'k', name: 'alexi' }], entries: [] });
  assert.deepEqual(p.missingKins, []);
  const plan = createImportPlan(p, {}, null);
  assert.equal(plan.entries.filter((e) => e.kinId === 'k').length, 2);
  assert.equal(plan.entries.find((e) => e.scope === 'global').kinId, null);
  const q = buildPreview(example(), { kins: [], entries: [] });
  assert.deepEqual(q.missingKins, ['Alexi']);
  assert.ok(createImportPlan(q, {}, 'chosen').entries.filter((e) => e.scope === 'kin').every((e) => e.kinId === 'chosen'));
});

test('re-import: skip by default, replace or keep both on request', () => {
  const first = createImportPlan(buildPreview(example(), { kins: [alexi], entries: [] }), {}, null);
  const p = buildPreview(example(), { kins: [alexi], entries: first.entries });
  assert.equal(p.items[0].conflict, 'same-entry');
  assert.equal(createImportPlan(p, {}, null).entries.length, 0);
  assert.deepEqual(createImportPlan(p, { 1: 'replace' }, null).replacedIds, ['cabana-lareira']);
  assert.notEqual(createImportPlan(p, { 1: 'separate' }, null).entries[0].id, 'cabana-lareira');
  assert.throws(() => createImportPlan(buildPreview(parseKJournalText(fixture('./fixtures/invalid-missing-end.kjournal')), { kins: [], entries: [] }), {}, null));
});

test('preview warns about keyphrases already used by competing entries', () => {
  const local = entry({ kinId: alexi.id, title: 'Local', keyphrases: ['perto da lareira'] });
  const p = buildPreview(example(), { kins: [alexi], entries: [local, entry({ kinId: 'other', keyphrases: ['tequila quântica'] })] });
  const found = p.diagnostics.filter((d) => d.code === 'local-keyphrase-collision');
  assert.equal(found.length, 1);
  assert.equal(found[0].entryIndex, 1);
});

test('backups: journal.json keeps status and Kin by id', () => {
  const e = entry({ kinId: 'kin-a', status: 'inKindroid', markedInKindroidAt: '2026-01-01T00:00:00.000Z' });
  const parsed = parseImportSource(bytes(serializeJournal({ ...emptyJournal(), entries: [e], kinNames: { 'kin-a': 'Alexi' } })));
  assert.equal(parsed.format, 'backup');
  const plan = createImportPlan(buildPreview(parsed, { kins: [{ id: 'kin-a', name: 'Renamed' }], entries: [] }), {}, null);
  assert.deepEqual([plan.entries[0].id, plan.entries[0].kinId, plan.entries[0].status], [e.id, 'kin-a', 'inKindroid']);
});

test('backups: standalone 2.0 matches Kins by name', () => {
  const backup = { schema: 'kindroid-journal-manager.backup', version: 2, kins: [{ id: 'local-1', name: 'Alexi' }], entries: [entry({ kinId: 'local-1', status: 'ready' })] };
  const plan = createImportPlan(buildPreview(parseImportSource(bytes(JSON.stringify(backup))), { kins: [{ id: 'real', name: 'alexi' }], entries: [] }), {}, null);
  assert.deepEqual([plan.entries[0].kinId, plan.entries[0].status], ['real', 'ready']);
});

test('backups: the 1.x export drops ai_id', () => {
  const at = '2025-07-30T00:00:00.000Z';
  const old = { schema: 'kindroid-journal-manager.export', version: 1, entries: [
    { id: 'a', title: 'A', aiId: 'abc123', content: 'First old entry text.', keyphrases: ['first'], status: 'published', createdAt: at, updatedAt: at },
    { id: 'b', title: 'B', aiId: 'abc123', content: 'Second old entry text.', keyphrases: ['second'], status: 'uncertain', createdAt: at, updatedAt: at },
  ] };
  const parsed = parseImportSource(bytes(JSON.stringify(old)));
  assert.ok(parsed.diagnostics.some((d) => d.code === 'legacy-ai-id'));
  const plan = createImportPlan(buildPreview(parsed, { kins: [], entries: [] }), {}, 'kin-x');
  assert.deepEqual(plan.entries.map((e) => [e.id, e.status, e.kinId]), [['a', 'inKindroid', 'kin-x'], ['b', 'draft', 'kin-x']]);
  assert.ok(!JSON.stringify(plan).includes('abc123'));
});

test('import source detection', () => {
  assert.equal(parseImportSource(fixture('../examples/exemplo.kjournal.json')).format, 'json');
  assert.equal(parseImportSource(fixture('../examples/exemplo.kjournal')).format, 'text');
});
