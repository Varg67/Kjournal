// What the Import box accepts, and how a confirmed import becomes entries. Sources: KJOURNAL text or JSON, a copy of
// journal.json, the standalone 2.0 backup ("kindroid-journal-manager.backup") and the 1.x export
// ("kindroid-journal-manager.export", built around the old API's ai_id, which is dropped). Kins are never created:
// only the Kins attached to the program exist, matched by id or by name.
import { findCollisions } from './collisions.js';
import { JOURNAL_SCHEMA, parseJournal } from './document.js';
import { createEntry } from './entry.js';
import { decode, parseKJournalJson, parseKJournalText } from './kjournal.js';
import { cleanKeyphrases, validateEntry } from './rules.js';
import { STATUSES } from './constants.js';
import { comparisonForm, isRecord, isTime, newId, nfc } from './text.js';

const V2_BACKUP = 'kindroid-journal-manager.backup';
const V1_EXPORT = 'kindroid-journal-manager.export';

const backupResult = (records, diagnostics) => ({ format: 'backup', version: 2, records, diagnostics, hasFatal: diagnostics.some((d) => d.severity === 'fatal') });
const broken = (message) => backupResult([], [{ severity: 'fatal', code: 'invalid-backup', message }]);
const phrases = (list) => cleanKeyphrases(list.filter((k) => typeof k === 'string'));

function parseBackup(value, text) {
  const records = [];
  const diagnostics = [];
  if (value.schema === JOURNAL_SCHEMA) {
    let journal;
    try { journal = parseJournal(text); } catch (e) { return broken(e.message); }
    for (const e of journal.entries) {
      records.push({
        id: e.id, title: e.title || undefined, kin: e.kinId ? journal.kinNames[e.kinId] : undefined, kinId: e.kinId || undefined,
        scope: e.scope, tags: e.tags, entry: e.content.trim(), keyphrases: cleanKeyphrases(e.keyphrases),
        kept: { status: e.status, createdAt: e.createdAt, markedInKindroidAt: e.markedInKindroidAt, author: e.author },
      });
    }
  } else if (value.schema === V2_BACKUP || value.schema === V1_EXPORT) {
    const v1 = value.schema === V1_EXPORT;
    const names = new Map();
    for (const k of Array.isArray(value.kins) ? value.kins : []) if (isRecord(k) && typeof k.id === 'string' && typeof k.name === 'string') names.set(k.id, k.name);
    if (!Array.isArray(value.entries)) return broken('The backup has no list of entries.');
    let sawAiId = false;
    value.entries.forEach((raw, i) => {
      if (!isRecord(raw) || typeof raw.content !== 'string' || !Array.isArray(raw.keyphrases)) {
        diagnostics.push({ severity: 'fatal', code: 'invalid-entry', message: 'A malformed entry in the backup.', entryIndex: i + 1 });
        return;
      }
      if (v1 && typeof raw.aiId === 'string' && raw.aiId.trim()) sawAiId = true;
      const scope = !v1 && raw.scope === 'global' ? 'global' : 'kin';
      const status = v1 ? (raw.status === 'published' ? 'inKindroid' : raw.status === 'ready' ? 'ready' : 'draft') : STATUSES.includes(raw.status) ? raw.status : 'draft';
      records.push({
        id: typeof raw.id === 'string' ? raw.id : undefined,
        title: typeof raw.title === 'string' && raw.title.trim() ? nfc(raw.title.trim()) : undefined,
        kin: !v1 && scope === 'kin' && typeof raw.kinId === 'string' ? names.get(raw.kinId) : undefined,
        scope,
        tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
        entry: nfc(raw.content.trim()),
        keyphrases: phrases(raw.keyphrases),
        kept: { status, createdAt: isTime(raw.createdAt) ? raw.createdAt : undefined, markedInKindroidAt: isTime(raw.markedInKindroidAt) ? raw.markedInKindroidAt : undefined },
      });
    });
    if (sawAiId) diagnostics.push({ severity: 'warning', code: 'legacy-ai-id', message: 'A backup from the old version: the old API\'s ai_id is dropped. Choose below which Kin these entries go to.' });
  }
  if (!records.length && !diagnostics.length) return broken('The backup has no entries.');
  const ids = new Set();
  records.forEach((r, i) => {
    if (!r.id) return;
    if (ids.has(r.id)) diagnostics.push({ severity: 'fatal', code: 'duplicate-id', message: 'The backup repeats an id.', entryIndex: i + 1 });
    ids.add(r.id);
  });
  return backupResult(records, diagnostics);
}

/** Bytes from the Import box (pasted text or a file): KJOURNAL text, KJOURNAL JSON or a backup. */
export function parseImportSource(bytes) {
  const decoded = decode(bytes);
  if (decoded.diagnostic) return { format: 'text', version: 2, records: [], diagnostics: [decoded.diagnostic], hasFatal: true };
  if (!decoded.text.trimStart().startsWith('{')) return parseKJournalText(bytes);
  let value = null;
  try { value = JSON.parse(decoded.text); } catch { /* the KJOURNAL JSON parser reports it */ }
  if (isRecord(value) && [JOURNAL_SCHEMA, V2_BACKUP, V1_EXPORT].includes(value.schema)) return parseBackup(value, decoded.text);
  return parseKJournalJson(bytes);
}

function destinationOf(record, kins) {
  if (record.scope === 'global') return { kind: 'global' };
  const byId = record.kinId && kins.find((k) => k.id === record.kinId);
  if (byId) return { kind: 'kin', kinId: byId.id, name: byId.name };
  if (record.kin) {
    const byName = kins.find((k) => comparisonForm(k.name) === comparisonForm(record.kin));
    if (byName) return { kind: 'kin', kinId: byName.id, name: byName.name };
    return { kind: 'default', missingKin: record.kin };
  }
  return { kind: 'default' };
}

/** What would happen: { items: [{ index, record, destination, conflict?, existingId? }], diagnostics, hasFatal, missingKins, format, version } */
export function buildPreview(parsed, { kins, entries }) {
  const diagnostics = parsed.diagnostics.slice();
  const missing = new Set();
  const items = parsed.records.map((record, i) => {
    const index = i + 1;
    const destination = destinationOf(record, kins);
    if (destination.missingKin) missing.add(destination.missingKin);
    const same = (e) => e.content.trim().normalize('NFC') === record.entry;
    const byId = record.id && entries.find((e) => e.id === record.id);
    const byText = entries.find(same);
    let conflict;
    let existingId;
    if (byId) { conflict = same(byId) ? 'same-entry' : 'same-id'; existingId = byId.id; }
    else if (byText) {
      conflict = 'same-content';
      existingId = byText.id;
      diagnostics.push({ severity: 'warning', code: 'local-content-match', message: `This text is already in the journal ("${byText.title || 'Untitled'}").`, entryIndex: index });
    }
    const probe = { id: `import-${index}`, scope: record.scope, kinId: destination.kinId || null, keyphrases: record.keyphrases };
    const exact = findCollisions(probe, entries.filter((e) => e.id !== existingId)).filter((c) => c.kind === 'exact');
    for (const k of new Set(exact.map((c) => c.keyphrase))) {
      const owner = exact.find((c) => c.keyphrase === k);
      diagnostics.push({ severity: 'warning', code: 'local-keyphrase-collision', message: `"${k}" is already used by "${owner.otherTitle || 'Untitled'}".`, entryIndex: index });
    }
    return { index, record, destination, conflict, existingId };
  });
  for (const name of missing) {
    diagnostics.push({ severity: 'warning', code: 'kin-not-attached', message: `"${name}" is not attached to this app. Those entries go where you choose below; attach the Kin in the app's settings to sort them later.` });
  }
  return { format: parsed.format, version: parsed.version, items, diagnostics, hasFatal: parsed.hasFatal, missingKins: [...missing] };
}

/** Skip what is already there; keep both when the same id now has different text. */
export function defaultDecision(item) {
  if (!item.conflict) return undefined;
  return item.conflict === 'same-id' ? 'separate' : 'skip';
}

/** The confirmed preview as entries: { entries, replacedIds, skipped }. `decisions`: { [index]: 'skip'|'replace'|'separate' }. */
export function createImportPlan(preview, decisions, defaultKinId, now = new Date().toISOString()) {
  if (preview.hasFatal) throw new Error('Fix the errors in the file first.');
  const entries = [];
  const replacedIds = [];
  let skipped = 0;
  for (const item of preview.items) {
    const decision = decisions[item.index] || defaultDecision(item);
    if (item.conflict && decision === 'skip') { skipped += 1; continue; }
    const { record, destination } = item;
    const replace = decision === 'replace' && item.existingId;
    const id = replace ? item.existingId : !item.conflict && record.id ? record.id : newId();
    if (replace) replacedIds.push(id);
    const kinId = destination.kind === 'global' ? null : destination.kind === 'kin' ? destination.kinId : defaultKinId;
    const entry = createEntry({
      id, title: record.title || `Imported ${item.index}`, scope: record.scope, kinId: record.scope === 'global' ? null : kinId,
      content: record.entry, keyphrases: cleanKeyphrases(record.keyphrases), tags: record.tags,
      createdAt: (record.kept && record.kept.createdAt) || now,
      updatedAt: now, // an import is an edit made now: it must win when copies of the journal are merged
    });
    if (record.kept) {
      if (record.kept.status !== 'draft' && validateEntry(entry).valid) entry.status = record.kept.status;
      if (record.kept.markedInKindroidAt) entry.markedInKindroidAt = record.kept.markedInKindroidAt;
      if (record.kept.author) entry.author = record.kept.author;
    }
    entries.push(entry);
  }
  return { entries, replacedIds, skipped };
}
