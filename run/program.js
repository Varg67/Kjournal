// What the run does, without Node: the Kin's two actions. Kindroid starts the run when the Kin uses one; the trigger
// is { trigger: "action", action, input, kin }. Files are read and written through `kin` (run/kin.js), or through the
// dev harness's stand-in.
//
// One writer per file: this run writes only kin-drafts.json (the Kin's drafts not yet taken in by the screen); it only
// reads journal.json, which the screen writes. So the screen and a run never overwrite each other.
import { DRAFTS_FILE, JOURNAL_FILE, LIMITS } from '../src/core/constants.js';
import { absorbDrafts, parseDrafts, parseJournal, serializeDrafts } from '../src/core/document.js';
import { createEntry } from '../src/core/entry.js';
import { cleanKeyphrases, validateEntry } from '../src/core/rules.js';
import { comparisonForm, countChars, isRecord, nfc } from '../src/core/text.js';
import { matchedKeyphrases } from '../src/core/triggers.js';

const MAX_KEPT_DRAFTS = 200;
const RESULT_LIMIT = 3800;
const STATUS_WORDS = { draft: 'draft', ready: 'ready, not yet in Kindroid', inKindroid: 'in your Kindroid journal', outdated: 'changed since it was added to Kindroid' };

async function load(kin) {
  const [journalText, draftsText] = await Promise.all([kin.get(JOURNAL_FILE), kin.get(DRAFTS_FILE)]);
  const journal = parseJournal(journalText); // throws on a damaged file: nothing is written then
  const drafts = parseDrafts(draftsText);
  const known = new Set(journal.entries.map((e) => e.id).concat(Object.keys(journal.deleted)));
  return { entries: absorbDrafts(journal, drafts).journal.entries, pending: drafts.filter((d) => !known.has(d.id)) };
}

const visibleTo = (entries, kinId) => entries.filter((e) => e.scope === 'global' || (kinId && e.kinId === kinId));

export async function saveJournalEntry({ kin, kinId, input, now = new Date() }) {
  if (!isRecord(input)) return { ok: false, message: 'Nothing saved: the action needs the entry text and keyphrases.' };
  const title = typeof input.title === 'string' ? nfc(input.title.trim()).slice(0, LIMITS.titleMaxChars) : '';
  const content = typeof input.entry === 'string' ? nfc(input.entry.replace(/\r\n?/g, '\n').trim()) : '';
  const given = Array.isArray(input.keyphrases) ? input.keyphrases.filter((k) => typeof k === 'string') : [];
  const keyphrases = cleanKeyphrases(given).slice(0, LIMITS.keyphraseMaxCount);
  const global = input.global === true;
  const at = now.toISOString();
  const entry = createEntry({ title, scope: global ? 'global' : 'kin', kinId: global ? null : kinId || null, content, keyphrases, author: 'kin', createdAt: at, updatedAt: at });
  const errors = validateEntry(entry).issues.filter((x) => x.severity === 'error');
  if (errors.length) return { ok: false, message: `Not saved. ${errors.map((x) => x.message).join(' ')}` };

  const { entries, pending } = await load(kin);
  const same = entries.find((e) => comparisonForm(e.content) === comparisonForm(content));
  if (same) return { ok: true, message: `This is already in the journal as "${same.title || 'Untitled'}". Nothing new was saved.` };
  await kin.put(DRAFTS_FILE, serializeDrafts(pending.concat([entry]).slice(-MAX_KEPT_DRAFTS)));

  const clashes = visibleTo(entries, kinId).filter((e) => e.keyphrases.some((k) => keyphrases.some((m) => comparisonForm(m) === comparisonForm(k))));
  const name = title || `${countChars(content)} characters`;
  return {
    ok: true,
    message: `Saved as a draft in the Journal app: "${name}", keyphrases: ${keyphrases.join(', ')}. It reaches your Kindroid journal only after they review it and add it there.`
      + (given.length > keyphrases.length ? ` Only the first ${LIMITS.keyphraseMaxCount} distinct keyphrases were kept.` : '')
      + (clashes.length ? ` Another entry already uses one of these keyphrases.` : ''),
  };
}

export async function readJournal({ kin, kinId, input }) {
  const query = isRecord(input) && typeof input.query === 'string' ? input.query.trim() : '';
  const { entries } = await load(kin);
  const mine = visibleTo(entries, kinId);
  if (!mine.length) return { ok: true, message: 'The journal has no entries for you yet.' };
  const q = comparisonForm(query);
  const words = q.split(' ').filter((w) => w.length > 2);
  const scored = mine.map((e) => {
    if (!q) return { e, score: 1 };
    const all = comparisonForm(`${e.title} ${e.content} ${e.keyphrases.join(' ')}`);
    const score = matchedKeyphrases(e, query).length * 5 + (comparisonForm(e.title).includes(q) ? 3 : 0)
      + (e.keyphrases.some((k) => comparisonForm(k).includes(q)) ? 4 : 0) + (comparisonForm(e.content).includes(q) ? 2 : 0)
      + words.filter((w) => all.includes(w)).length;
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || (a.e.updatedAt < b.e.updatedAt ? 1 : -1)).slice(0, 5);
  if (!scored.length) return { ok: true, message: `Nothing in the journal about "${query}".` };
  const parts = [];
  let length = 0;
  for (const { e } of scored) {
    const block = `${e.title || 'Untitled'} (${e.scope === 'global' ? 'global, ' : ''}${STATUS_WORDS[e.status]}; keyphrases: ${e.keyphrases.join(', ')})\n${e.content}`;
    if (length + block.length > RESULT_LIMIT) break;
    parts.push(block);
    length += block.length + 2;
  }
  return { ok: true, message: parts.join('\n\n') };
}

/** The run: one trigger in, { ok, message } out (main.js turns it into kin end). */
export async function runProgram({ event, kin, now = new Date() }) {
  if (!isRecord(event) || event.trigger !== 'action') return { ok: false, message: 'Journal only runs when the Kin uses one of its actions.' };
  const kinId = typeof event.kin === 'string' && event.kin ? event.kin : null;
  if (event.action === 'save_journal_entry') return saveJournalEntry({ kin, kinId, input: event.input, now });
  if (event.action === 'read_journal') return readJournal({ kin, kinId, input: event.input });
  return { ok: false, message: 'Journal does not know that action.' };
}
