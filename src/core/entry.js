// Creating and changing one entry. An entry:
//   { id, title, scope: 'kin'|'global', kinId: string|null, content, keyphrases: string[], tags: string[],
//     status: 'draft'|'ready'|'inKindroid'|'outdated', createdAt, updatedAt, markedInKindroidAt?, author?: 'kin' }
// "inKindroid" is set by the person after pasting the entry into the Kin's Journal in Kindroid; this app never
// writes to Kindroid's journal itself.
import { validateEntry } from './rules.js';
import { comparisonForm, newId, nextTime, normalizeKeyphrase } from './text.js';

export function createEntry(overrides = {}) {
  const now = new Date().toISOString();
  return { id: newId(), title: '', scope: 'kin', kinId: null, content: '', keyphrases: [], tags: [], status: 'draft', createdAt: now, updatedAt: now, ...overrides };
}

const phrasesKey = (list) => list.map((k) => comparisonForm(normalizeKeyphrase(k))).filter(Boolean).join('\u0000');

/**
 * Applies an edit. An entry already in Kindroid whose text, keyphrases, Kin or scope change becomes "outdated", so
 * the person knows to update it there by hand.
 */
export function applyEdit(entry, patch, now = new Date()) {
  const next = { ...entry, ...patch, id: entry.id, updatedAt: nextTime(entry.updatedAt, now) };
  const visible = next.content.trim() !== entry.content.trim() || phrasesKey(next.keyphrases) !== phrasesKey(entry.keyphrases)
    || next.scope !== entry.scope || next.kinId !== entry.kinId;
  if (entry.status === 'inKindroid' && visible && patch.status === undefined) next.status = 'outdated';
  return next;
}

/** The statuses the person may pick now: ready and in Kindroid only when the entry has no errors. */
export function allowedStatuses(entry) {
  const options = ['draft'];
  if (validateEntry(entry).valid) options.push('ready', 'inKindroid');
  if (entry.status === 'outdated') options.push('outdated');
  return options;
}

export function setStatus(entry, status, now = new Date()) {
  if (!allowedStatuses(entry).includes(status)) throw new Error('Fix the errors in this entry first.');
  return { ...entry, status, updatedAt: nextTime(entry.updatedAt, now), markedInKindroidAt: status === 'inKindroid' ? now.toISOString() : entry.markedInKindroidAt };
}

export function duplicateEntry(entry) {
  const now = new Date().toISOString();
  const copy = { ...entry, id: newId(), title: entry.title ? `${entry.title} (copy)` : 'Copy', status: 'draft', createdAt: now, updatedAt: now };
  delete copy.markedInKindroidAt;
  delete copy.author;
  return copy;
}
