// journal.json: the whole library, in the program's folder. Only the screen writes it. Two open screens (phone and
// computer) are reconciled with mergeJournals: the newest edit of each entry wins, and deletions are kept as dated
// tombstones so a stale copy cannot bring an entry back. The Kin's drafts come from kin-drafts.json, which only the
// run writes; the screen takes in the ones it has never seen.
import { STATUSES } from './constants.js';
import { isRecord, isTime } from './text.js';

export const JOURNAL_SCHEMA = 'kjournal.workshop';
export const DRAFTS_SCHEMA = 'kjournal.kin-drafts';
const TOMBSTONE_DAYS = 120;
const MAX_ENTRIES = 5000;

export function emptyJournal(at = new Date(0).toISOString()) {
  return { schema: JOURNAL_SCHEMA, version: 1, updatedAt: at, entries: [], deleted: {}, kinNames: {} };
}

function strings(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  return value.every((x) => typeof x === 'string' && x.length <= maxLength) ? value.slice() : null;
}

/** One stored entry, checked; null when malformed (never throws). */
export function parseEntry(value) {
  if (!isRecord(value)) return null;
  const { id, title, scope, kinId, content, keyphrases, tags, status, createdAt, updatedAt } = value;
  if (typeof id !== 'string' || !id || id.length > 200) return null;
  if (scope !== 'kin' && scope !== 'global') return null;
  if (!STATUSES.includes(status)) return null;
  if (typeof content !== 'string' || content.length > 100000) return null;
  const phrases = strings(keyphrases, 50, 500);
  const tagList = tags === undefined ? [] : strings(tags, 50, 100);
  if (!phrases || !tagList || !isTime(createdAt) || !isTime(updatedAt)) return null;
  const entry = {
    id, title: typeof title === 'string' ? title.slice(0, 500) : '', scope,
    kinId: scope === 'kin' && typeof kinId === 'string' && kinId ? kinId.slice(0, 200) : null,
    content, keyphrases: phrases, tags: tagList, status, createdAt, updatedAt,
  };
  if (isTime(value.markedInKindroidAt)) entry.markedInKindroidAt = value.markedInKindroidAt;
  if (value.author === 'kin') entry.author = 'kin';
  return entry;
}

/** journal.json as text (null: no file yet). A file that exists but cannot be read throws: it is never written over. */
export function parseJournal(text) {
  if (text === null || text === undefined || String(text).trim() === '') return emptyJournal();
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('journal.json is damaged (not JSON).'); }
  if (!isRecord(value) || value.schema !== JOURNAL_SCHEMA || value.version !== 1) throw new Error('journal.json has an unknown format.');
  const journal = emptyJournal();
  if (isTime(value.updatedAt)) journal.updatedAt = value.updatedAt;
  const seen = new Set();
  for (const raw of Array.isArray(value.entries) ? value.entries.slice(0, MAX_ENTRIES) : []) {
    const entry = parseEntry(raw);
    if (entry && !seen.has(entry.id)) { seen.add(entry.id); journal.entries.push(entry); }
  }
  if (isRecord(value.deleted)) for (const [id, at] of Object.entries(value.deleted)) if (isTime(at)) journal.deleted[id] = at;
  if (isRecord(value.kinNames)) for (const [id, name] of Object.entries(value.kinNames)) if (typeof name === 'string') journal.kinNames[id] = name.slice(0, 200);
  return journal;
}

export const serializeJournal = (journal) => `${JSON.stringify(journal, null, 1)}\n`;

const later = (a, b) => (a >= b ? a : b);
const byNewest = (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);

/** Two copies of the library combined. Order does not matter. */
export function mergeJournals(a, b, now = new Date()) {
  const deleted = { ...a.deleted };
  for (const [id, at] of Object.entries(b.deleted)) deleted[id] = deleted[id] ? later(deleted[id], at) : at;
  const cutoff = new Date(now.getTime() - TOMBSTONE_DAYS * 86400000).toISOString();
  for (const [id, at] of Object.entries(deleted)) if (at < cutoff) delete deleted[id];
  const byId = new Map();
  for (const entry of a.entries.concat(b.entries)) {
    const current = byId.get(entry.id);
    if (!current || entry.updatedAt > current.updatedAt) byId.set(entry.id, entry);
  }
  const entries = [...byId.values()].filter((e) => !(deleted[e.id] && deleted[e.id] >= e.updatedAt)).sort(byNewest);
  return { schema: JOURNAL_SCHEMA, version: 1, updatedAt: later(a.updatedAt, b.updatedAt), entries, deleted, kinNames: { ...b.kinNames, ...a.kinNames } };
}

/** kin-drafts.json as text; anything unreadable is no drafts (the run rewrites it on its next save). */
export function parseDrafts(text) {
  if (!text || !String(text).trim()) return [];
  try {
    const value = JSON.parse(text);
    if (!isRecord(value) || !Array.isArray(value.entries)) return [];
    return value.entries.map(parseEntry).filter(Boolean);
  } catch { return []; }
}

export const serializeDrafts = (entries) => `${JSON.stringify({ schema: DRAFTS_SCHEMA, version: 1, entries }, null, 1)}\n`;

/** The Kin's drafts the library has never seen (not there, not deleted), added. { journal, added } */
export function absorbDrafts(journal, drafts) {
  const known = new Set(journal.entries.map((e) => e.id).concat(Object.keys(journal.deleted)));
  const added = drafts.filter((d) => !known.has(d.id));
  if (!added.length) return { journal, added };
  return { journal: { ...journal, entries: added.concat(journal.entries).sort(byNewest) }, added };
}

/** Whether two copies hold the same things (updatedAt aside). */
export const sameJournal = (a, b) => serializeJournal({ ...a, updatedAt: '' }) === serializeJournal({ ...b, updatedAt: '' });

/** A Kin's name for labels: attached Kins first, then the names remembered in journal.json. */
export function kinName(kinId, kins, names) {
  if (!kinId) return 'No Kin';
  const kin = kins.find((k) => k.id === kinId);
  return kin ? kin.name : names[kinId] || 'Detached Kin';
}
