// Entries "compete" when Kindroid could recall both for one message: two entries of the same Kin, or any entry and a
// global one. Shared keyphrases between competing entries are worth a warning.
import { comparisonForm, normalizeKeyphrase } from './text.js';

export function competes(a, b) {
  if (a.id === b.id) return false;
  if (a.scope === 'global' || b.scope === 'global') return true;
  return a.kinId !== null && a.kinId === b.kinId;
}

/** [{ keyphrase, otherId, otherTitle, kind: 'exact'|'contains' }] */
export function findCollisions(candidate, entries) {
  const mine = candidate.keyphrases.map(normalizeKeyphrase).filter(Boolean).map((k) => ({ k, c: comparisonForm(k) }));
  const out = [];
  for (const other of entries) {
    if (!competes(candidate, other)) continue;
    for (const raw of other.keyphrases) {
      const theirs = comparisonForm(raw);
      if (!theirs) continue;
      for (const { k, c } of mine) {
        if (c === theirs) out.push({ keyphrase: k, otherId: other.id, otherTitle: other.title, kind: 'exact' });
        else if (c.includes(theirs) || theirs.includes(c)) out.push({ keyphrase: k, otherId: other.id, otherTitle: other.title, kind: 'contains' });
      }
    }
  }
  return out;
}

export function collisionIssues(collisions) {
  return collisions.map((c) => ({
    severity: 'warning',
    field: 'keyphrases',
    code: c.kind === 'exact' ? 'keyphrase_collision' : 'keyphrase_overlap',
    message: c.kind === 'exact'
      ? `"${c.keyphrase}" is also a keyphrase of "${c.otherTitle || 'Untitled'}": both entries compete for the same message.`
      : `"${c.keyphrase}" overlaps a keyphrase of "${c.otherTitle || 'Untitled'}": one message can fire both.`,
  }));
}
