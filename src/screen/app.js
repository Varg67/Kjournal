// The screen: the list or one entry, and the sheets over them. UI state lives here; the library lives in the store.
import { APP_VERSION, JOURNAL_FILE } from '../core/constants.js';
import { problemIds } from '../core/library.js';
import { h, fill, keepFocus } from './dom.js';
import { icon } from './icons.js';
import { createStore } from './store.js';
import { renderEditor } from './views/editor.js';
import { renderList } from './views/list.js';
import { openExport, openImport, openLab, openMenu } from './views/panels.js';
import { mountLayers, toast } from './views/sheet.js';

const REFRESH_MS = 20000;

export async function startApp({ root, channel, kins, current }) {
  const store = createStore(channel);
  const main = h('div', { class: 'main' });
  fill(root, main);
  mountLayers(root);
  store.onNotice((text, tone) => toast(text, tone));

  try {
    await store.load();
  } catch (e) {
    fill(main, h('div', { class: 'card-msg' }, icon('alert', 28), h('h2', {}, 'Journal could not open its file'), h('p', {}, `${e.message} Nothing was deleted or written over.`),
      h('p', { class: 'muted' }, `The file is ${JOURNAL_FILE} in this app's folder. Close and reopen the app; if it keeps happening, restore a backup with Import after fixing the file.`)));
    return;
  }

  const ui = { view: 'list', entryId: null, editor: null, filter: { collection: { kind: 'all' }, query: '', status: 'all', tag: null } };
  let problems = null;
  let openedFromKin = false;

  const ctx = {
    store, ui, version: APP_VERSION,
    problems: () => problems || (problems = problemIds(store.state.journal.entries)),
    render,
    openMenu: () => openMenu(ctx),
    openLab: () => openLab(ctx),
    openImport: () => openImport(ctx),
    openExport: () => openExport(ctx),
    selectCollection(c) { ui.filter = { ...ui.filter, collection: c, tag: null }; ui.view = 'list'; render(); },
    openEntry(id) { ui.view = 'entry'; ui.entryId = id; render(); window.scrollTo(0, 0); },
    closeEntry() { ui.view = 'list'; ui.entryId = null; render(); },
    newEntry() {
      const c = ui.filter.collection;
      const { kins: attached, current: cur } = store.state;
      const fallback = cur || (attached.length === 1 ? attached[0].id : null);
      const e = store.add(c.kind === 'global' ? { scope: 'global', kinId: null } : c.kind === 'kin' ? { kinId: c.kinId } : { kinId: c.kind === 'unassigned' ? null : fallback });
      ui.filter = { ...ui.filter, query: '', status: 'all', tag: null };
      ctx.openEntry(e.id);
      const t = root.querySelector('.title-input');
      if (t) t.focus();
    },
  };

  function render() {
    problems = null;
    keepFocus(main, () => {
      const exists = ui.entryId && store.state.journal.entries.some((e) => e.id === ui.entryId);
      if (ui.view === 'entry' && exists) {
        ui.editor = renderEditor(ctx, ui.entryId);
        fill(main, ui.editor.view);
      } else {
        ui.view = 'list';
        ui.editor = null;
        fill(main, renderList(ctx));
      }
    });
  }

  store.on((what) => {
    problems = null;
    if (ui.view === 'entry' && ui.editor && (what === 'journal' || what === 'save' || what === 'kins')) {
      if (store.state.journal.entries.some((e) => e.id === ui.entryId)) ui.editor.refresh();
      else { ui.view = 'list'; render(); } // deleted on another screen
    } else if (ui.view === 'list' && what !== 'save') {
      const active = document.activeElement;
      if (!(active && active.getAttribute('data-key') === 'search')) render();
    }
  });

  const takeKins = (list, cur) => {
    store.setKins(list, cur === undefined ? store.state.current : cur);
    if (cur && !openedFromKin) { openedFromKin = true; ctx.selectCollection({ kind: 'kin', kinId: cur }); }
  };
  if (kins) takeKins(kins, current);
  channel.onKins((list, cur) => takeKins(list, cur));

  setInterval(() => store.refresh(), REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') store.refresh(); });
  window.addEventListener('focus', () => store.refresh());
  window.addEventListener('beforeunload', () => { if (store.pending()) store.saveNow(); });
  render();
}
