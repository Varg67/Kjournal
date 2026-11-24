// What the screen says, in one place.
export const STATUS_LABEL = { draft: 'Draft', ready: 'Ready', inKindroid: 'In Kindroid', outdated: 'Outdated' };
export const STATUS_HINT = {
  draft: 'Still being written.',
  ready: 'Passes the rules. Ready to paste into Kindroid.',
  inKindroid: 'You marked it as added to the Kin\'s Journal in Kindroid.',
  outdated: 'Changed after it went to Kindroid. Update it there, then mark it again.',
};
export const SAVE_LABEL = { saved: 'Saved', unsaved: 'Edited', saving: 'Saving…', failed: 'Not saved' };
export const FILTERS = [['all', 'All'], ['draft', 'Drafts'], ['ready', 'Ready'], ['inKindroid', 'In Kindroid'], ['outdated', 'Outdated'], ['issues', 'Warnings']];

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function excerpt(text, max = 130) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** "14:05" today, "Nov 22" this year, "Nov 22, 2025" before. */
export function shortDate(iso, now = new Date()) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function collectionTitle(collection, kins, names) {
  if (collection.kind === 'all') return 'All entries';
  if (collection.kind === 'global') return 'Global';
  if (collection.kind === 'unassigned') return 'No Kin';
  const kin = kins.find((k) => k.id === collection.kinId);
  return kin ? kin.name : names[collection.kinId] || 'Detached Kin';
}
