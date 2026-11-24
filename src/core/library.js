// Views of the library: which collection is open, search and filters, and each entry's problems.
import { collisionIssues, findCollisions } from './collisions.js';
import { validateEntry } from './rules.js';
import { comparisonForm } from './text.js';

/** A collection: { kind: 'all'|'global'|'unassigned' } or { kind: 'kin', kinId }. */
export function inCollection(entry, collection) {
  if (collection.kind === 'all') return true;
  if (collection.kind === 'global') return entry.scope === 'global';
  if (collection.kind === 'unassigned') return entry.scope === 'kin' && entry.kinId === null;
  return entry.scope === 'kin' && entry.kinId === collection.kinId;
}

export const sameCollection = (a, b) => a.kind === b.kind && (a.kind !== 'kin' || a.kinId === b.kinId);

export const entryIssues = (entry, all) => validateEntry(entry).issues.concat(collisionIssues(findCollisions(entry, all)));

/** filter: { collection, query, status: 'all'|'issues'|<status>, tag: string|null } */
export function filterEntries(entries, filter, problemIds) {
  const query = comparisonForm(filter.query || '');
  return entries.filter((e) => {
    if (!inCollection(e, filter.collection)) return false;
    if (filter.status === 'issues' ? !problemIds.has(e.id) : filter.status !== 'all' && e.status !== filter.status) return false;
    if (filter.tag && !e.tags.includes(filter.tag)) return false;
    return !query || comparisonForm([e.title, e.content].concat(e.keyphrases, e.tags).join(' \u0000 ')).includes(query);
  });
}

/** Ids of entries with any error or warning, collisions included. */
export function problemIds(entries) {
  return new Set(entries.filter((e) => entryIssues(e, entries).length).map((e) => e.id));
}

export const allTags = (entries) => [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b));
