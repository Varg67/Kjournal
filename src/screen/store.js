// The screen's library: what is on screen, and how it reaches journal.json. Every change is saved shortly after
// (debounced) by reading the latest journal.json and kin-drafts.json, merging, and writing the result only if it
// differs. A refresh every 20 seconds, and when the screen comes back into view, brings in other screens' edits and
// the Kin's drafts. Tested in Node with a stand-in channel (tests/store.test.js).
import { DRAFTS_FILE, JOURNAL_FILE } from '../core/constants.js';
import { absorbDrafts, emptyJournal, mergeJournals, parseDrafts, parseJournal, sameJournal, serializeJournal } from '../core/document.js';
import { applyEdit, createEntry, duplicateEntry, setStatus } from '../core/entry.js';
import { nextTime } from '../core/text.js';

const SAVE_DELAY_MS = 700;

export function createStore(channel, { delay = SAVE_DELAY_MS } = {}) {
  const state = { journal: emptyJournal(), kins: [], current: null, save: 'saved', error: '' };
  const listeners = [];
  const notices = [];
  let timer = null;
  let saving = null;
  let dirty = false;

  const emit = (what) => listeners.slice().forEach((fn) => fn(what));
  const notice = (text, tone) => notices.slice().forEach((fn) => fn(text, tone));
  const setSave = (s) => { if (state.save !== s) { state.save = s; emit('save'); } };

  async function pull(local) {
    const [remoteText, draftsText] = await Promise.all([channel.read(JOURNAL_FILE), channel.read(DRAFTS_FILE)]);
    const merged = mergeJournals(local, parseJournal(remoteText));
    const { journal, added } = absorbDrafts(merged, parseDrafts(draftsText));
    return { journal, added, remoteText };
  }

  function announceDrafts(added) {
    if (added.length) notice(added.length === 1 ? 'Your Kin wrote a new draft.' : `Your Kin wrote ${added.length} new drafts.`, 'ok');
  }

  async function saveNow() {
    if (saving) { dirty = true; return saving; }
    clearTimeout(timer);
    timer = null;
    dirty = false;
    const local = state.journal;
    setSave('saving');
    saving = (async () => {
      try {
        const { journal, added, remoteText } = await pull(local);
        const text = serializeJournal(journal);
        if (text !== remoteText) await channel.write(JOURNAL_FILE, text);
        // Keep edits made while saving: they are newer, so the merge keeps them.
        const before = state.journal;
        state.journal = before === local ? journal : mergeJournals(before, journal);
        if (!sameJournal(before, state.journal)) emit('journal');
        announceDrafts(added);
        setSave(dirty || before !== local ? 'unsaved' : 'saved');
      } catch (e) {
        state.error = e.message;
        setSave('failed');
        notice('Could not save to Kindroid. Your edits are still here; it tries again on the next change.', 'error');
      } finally {
        saving = null;
      }
      if (dirty || state.save === 'unsaved') schedule();
    })();
    return saving;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { saveNow(); }, delay);
  }

  /** Applies `change(journal)` and saves it soon. */
  function update(change) {
    const next = change(state.journal);
    next.updatedAt = nextTime(state.journal.updatedAt);
    state.journal = next;
    setSave('unsaved');
    emit('journal');
    schedule();
  }

  const mapEntry = (id, fn) => update((j) => ({ ...j, entries: j.entries.map((e) => (e.id === id ? fn(e) : e)) }));

  return {
    state,
    on: (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    onNotice: (fn) => { notices.push(fn); },
    pending: () => Boolean(timer || saving || state.save === 'unsaved'),

    /** First load. Throws when journal.json exists but cannot be read (it is then never written over). */
    async load() {
      const { journal, added } = await pull(emptyJournal());
      state.journal = journal;
      emit('journal');
      if (added.length) { announceDrafts(added); setSave('unsaved'); schedule(); }
    },

    /** Brings in other screens' edits and the Kin's drafts, when nothing local is waiting to be saved. */
    async refresh() {
      if (timer || saving || state.save === 'unsaved' || state.save === 'failed') return;
      try {
        const local = state.journal;
        const { journal, added } = await pull(local);
        if (state.journal !== local || timer || saving) return;
        if (!sameJournal(local, journal)) { state.journal = journal; emit('journal'); }
        if (added.length) { announceDrafts(added); setSave('unsaved'); schedule(); }
      } catch { /* a missed refresh is harmless */ }
    },

    setKins(kins, current) {
      state.kins = kins.slice().sort((a, b) => a.name.localeCompare(b.name));
      if (current !== undefined) state.current = current;
      emit('kins');
      const names = state.journal.kinNames;
      if (kins.some((k) => names[k.id] !== k.name)) {
        update((j) => ({ ...j, kinNames: Object.assign({}, j.kinNames, Object.fromEntries(kins.map((k) => [k.id, k.name]))) }));
      }
    },

    add(overrides) {
      const entry = createEntry(overrides);
      update((j) => ({ ...j, entries: [entry].concat(j.entries) }));
      return entry;
    },
    edit: (id, patch) => mapEntry(id, (e) => applyEdit(e, patch)),
    setStatus: (id, status) => mapEntry(id, (e) => setStatus(e, status)),
    duplicate(id) {
      const source = state.journal.entries.find((e) => e.id === id);
      if (!source) return null;
      const copy = duplicateEntry(source);
      update((j) => ({ ...j, entries: [copy].concat(j.entries) }));
      return copy;
    },
    remove(id) {
      const now = new Date().toISOString();
      update((j) => {
        const gone = j.entries.find((e) => e.id === id);
        const at = gone && gone.updatedAt > now ? gone.updatedAt : now; // never older than the last edit
        return { ...j, entries: j.entries.filter((e) => e.id !== id), deleted: { ...j.deleted, [id]: at } };
      });
    },
    importPlan(plan) {
      const ids = new Set(plan.entries.map((e) => e.id));
      update((j) => {
        const deleted = { ...j.deleted };
        ids.forEach((id) => delete deleted[id]);
        return { ...j, deleted, entries: plan.entries.concat(j.entries.filter((e) => !ids.has(e.id))) };
      });
    },
    writeFile: (path, text) => channel.write(path, text),
    saveNow,
  };
}
