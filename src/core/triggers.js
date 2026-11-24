// A local stand-in for Kindroid's recall: a keyphrase fires when it appears verbatim (case-insensitive) in the
// person's message. Only the person's message counts, never the Kin's reply.
import { LIMITS } from './constants.js';
import { comparisonForm, normalizeKeyphrase } from './text.js';

export function matchedKeyphrases(entry, message) {
  const haystack = comparisonForm(message);
  if (!haystack) return [];
  return entry.keyphrases.map(normalizeKeyphrase).filter((k) => k && haystack.includes(comparisonForm(k)));
}

/** { individual, global, individualOverflow, globalOverflow }: what one message would recall for `kinId`. */
export function simulateTriggers(message, entries, kinId) {
  const individual = [];
  const global = [];
  for (const entry of entries) {
    const relevant = entry.scope === 'global' || (kinId !== null && entry.kinId === kinId);
    if (!relevant) continue;
    const matched = matchedKeyphrases(entry, message);
    if (matched.length) (entry.scope === 'global' ? global : individual).push({ entry, matched });
  }
  const cap = LIMITS.recalledPerMessagePerType;
  return { individual, global, individualOverflow: individual.length > cap, globalOverflow: global.length > cap };
}

/** The text cut into [{ text, hit }] around the matched phrases, overlaps merged. */
export function highlightRanges(text, phrases) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const phrase of phrases) {
    const needle = phrase.toLowerCase();
    if (!needle) continue;
    for (let from = 0; ;) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      hits.push([at, at + needle.length]);
      from = at + needle.length;
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    if (last && hit[0] <= last[1]) last[1] = Math.max(last[1], hit[1]);
    else merged.push([hit[0], hit[1]]);
  }
  const parts = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}
