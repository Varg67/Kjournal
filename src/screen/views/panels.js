// The sheets: collections and files, test triggers, import, export.
import { EXPORT_FILES, LIMITS } from '../../core/constants.js';
import { kinName, serializeJournal } from '../../core/document.js';
import { buildPreview, createImportPlan, defaultDecision, parseImportSource } from '../../core/importing.js';
import { serializeKJournalJson, serializeKJournalText, serializeMarkdown, toRecords } from '../../core/kjournal.js';
import { inCollection, sameCollection } from '../../core/library.js';
import { highlightRanges, simulateTriggers } from '../../core/triggers.js';
import { h, fill } from '../dom.js';
import { icon } from '../icons.js';
import { plural } from '../texts.js';
import { copyText, openSheet, toast } from './sheet.js';

export function openMenu(ctx) {
  const { store, ui } = ctx;
  const { journal, kins } = store.state;
  const count = (c) => journal.entries.filter((e) => inCollection(e, c)).length;
  const attached = new Set(kins.map((k) => k.id));
  const detached = [...new Set(journal.entries.filter((e) => e.scope === 'kin' && e.kinId && !attached.has(e.kinId)).map((e) => e.kinId))];
  const item = (c, label, ic, muted) => h('button', { type: 'button', class: `nav${sameCollection(c, ui.filter.collection) ? ' on' : ''}${muted ? ' muted' : ''}`,
    onClick: () => { close(); ctx.selectCollection(c); } }, ic, h('span', { class: 'grow' }, label), h('span', { class: 'muted' }, String(count(c))));
  const avatar = (name) => h('span', { class: 'avatar', 'aria-hidden': 'true' }, name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => Array.from(p)[0].toUpperCase()).join('') || '?');
  const unassigned = count({ kind: 'unassigned' });
  const close = openSheet({
    title: 'Journal',
    body: [
      h('nav', { class: 'navs', 'aria-label': 'Collections' },
        item({ kind: 'all' }, 'All entries', icon('layers')),
        item({ kind: 'global' }, 'Global', icon('globe')),
        unassigned ? item({ kind: 'unassigned' }, 'No Kin', icon('inbox')) : null,
        h('p', { class: 'nav-head' }, 'Kins'),
        kins.length ? null : h('p', { class: 'hint' }, 'No Kin is attached. In Kindroid, open this app\'s settings → Kins and tick yours.'),
        kins.map((k) => item({ kind: 'kin', kinId: k.id }, k.name, avatar(k.name))),
        detached.map((id) => item({ kind: 'kin', kinId: id }, `${kinName(id, kins, journal.kinNames)} (detached)`, avatar(kinName(id, kins, journal.kinNames)), true)),
        h('p', { class: 'nav-head' }, 'Files'),
        h('button', { type: 'button', class: 'nav', onClick: () => { close(); openImport(ctx); } }, icon('upload'), h('span', { class: 'grow' }, 'Import')),
        h('button', { type: 'button', class: 'nav', disabled: !journal.entries.length, onClick: () => { close(); openExport(ctx); } }, icon('download'), h('span', { class: 'grow' }, 'Export and backup'))),
      h('p', { class: 'hint small' }, icon('info', 13), ` Saved in this app's folder in Kindroid. Nothing leaves it. Journal ${ctx.version}`),
    ],
  });
}

export function openLab(ctx) {
  const { store, ui } = ctx;
  const { kins } = store.state;
  const start = ui.filter.collection.kind === 'kin' ? ui.filter.collection.kinId : store.state.current || (kins[0] && kins[0].id) || '';
  const select = h('select', { 'aria-label': 'Chatting with' }, h('option', { value: '' }, 'No Kin (global only)'), kins.map((k) => h('option', { value: k.id, selected: k.id === start }, k.name)));
  const message = h('textarea', { rows: 3, placeholder: 'Remember that night at the cabin?', 'aria-label': 'Your message' });
  const preview = h('p', { class: 'lab-preview', hidden: true });
  const results = h('div', { class: 'lab-results' });
  const group = (label, matches, overflow) => h('div', { class: 'lab-group' },
    h('h3', {}, label, h('span', { class: `count${overflow ? ' over' : ''}` }, `${matches.length} / ${LIMITS.recalledPerMessagePerType}`)),
    overflow ? h('p', { class: 'issue warning' }, icon('info', 15), h('span', {}, `More than ${LIMITS.recalledPerMessagePerType} fire. Kindroid recalls only ${LIMITS.recalledPerMessagePerType} per message: some will be left out.`)) : null,
    matches.length ? matches.map((m) => h('button', { type: 'button', class: 'match', onClick: () => { close(); ctx.openEntry(m.entry.id); } },
      h('strong', {}, m.entry.title || 'Untitled'), h('span', { class: 'card-meta' }, m.matched.map((k) => h('span', { class: 'mini hit' }, k))))) : h('p', { class: 'muted' }, 'None fires.'));
  const update = () => {
    const r = simulateTriggers(message.value, store.state.journal.entries, select.value || null);
    const phrases = r.individual.concat(r.global).flatMap((m) => m.matched);
    preview.hidden = !message.value.trim() || !phrases.length;
    fill(preview, highlightRanges(message.value, phrases).map((p) => (p.hit ? h('mark', {}, p.text) : p.text)));
    fill(results, group('This Kin', r.individual, r.individualOverflow), group('Global', r.global, r.globalOverflow));
  };
  message.addEventListener('input', update);
  select.addEventListener('change', update);
  const close = openSheet({
    title: 'Test triggers',
    description: 'Type a message as you would in chat and see which entries Kindroid would recall. A local check: nothing is sent.',
    body: [h('div', { class: 'field' }, h('span', { class: 'label' }, 'Chatting with'), select), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Your message'), message), preview, results],
  });
  update();
  message.focus();
}

export function openImport(ctx) {
  const text = h('textarea', { class: 'mono', rows: 11, spellcheck: 'false', 'aria-label': 'Content to import', placeholder: 'KJOURNAL/2\n\n@@JOURNAL\ntitle: …\nkin: …\n@@KEYPHRASES\n- …\n@@ENTRY\n…\n@@END' });
  const file = h('input', { type: 'file', accept: '.kjournal,.json,.txt,application/json,text/plain', hidden: true,
    onChange: async (e) => { const f = e.target.files && e.target.files[0]; if (f) { close(); preview(ctx, new Uint8Array(await f.arrayBuffer()), f.name); } } });
  const close = openSheet({
    title: 'Import',
    description: 'Paste a KJOURNAL file (text or JSON), a backup of this app, or a backup of the older versions. Nothing is saved before the preview.',
    body: [text, file],
    footer: [
      h('button', { type: 'button', class: 'btn ghost', onClick: () => file.click() }, 'Choose file'),
      h('button', { type: 'button', class: 'btn primary', onClick: () => { if (!text.value.trim()) return; close(); preview(ctx, new TextEncoder().encode(text.value), 'pasted text'); } }, 'Preview'),
    ],
  });
}

const CONFLICT = { 'same-entry': 'Imported before (same id and text).', 'same-id': 'Same id as an entry here, but the text changed.', 'same-content': 'The same text is already here.' };

function preview(ctx, bytes, source) {
  const { store, ui } = ctx;
  const p = buildPreview(parseImportSource(bytes), { kins: store.state.kins, entries: store.state.journal.entries });
  const decisions = {};
  let defaultKin = ui.filter.collection.kind === 'kin' ? ui.filter.collection.kinId : store.state.current || '';
  const fatal = p.diagnostics.filter((d) => d.severity === 'fatal');
  const warnings = p.diagnostics.filter((d) => d.severity === 'warning');
  const needsDefault = p.items.some((i) => i.destination.kind === 'default');
  const ack = h('input', { type: 'checkbox' });
  const go = h('button', { type: 'button', class: 'btn primary' }, p.format === 'backup' ? 'Restore' : 'Import as drafts');
  const summary = h('span', { class: 'muted grow' });
  const list = h('ol', { class: 'import-list' });
  const where = (d) => (d.kind === 'global' ? 'Global' : d.kind === 'kin' ? d.name : (store.state.kins.find((k) => k.id === defaultKin) || { name: 'No Kin' }).name);

  const draw = () => {
    let create = 0;
    let replace = 0;
    let skip = 0;
    fill(list, p.items.map((item) => {
      const d = decisions[item.index] || defaultDecision(item);
      if (!item.conflict || d === 'separate') create += 1; else if (d === 'replace') replace += 1; else skip += 1;
      const options = item.conflict ? ['skip'].concat(item.conflict === 'same-content' ? [] : ['replace'], ['separate']) : [];
      return h('li', { class: `import-item${item.conflict && d === 'skip' ? ' skipped' : ''}` },
        h('div', { class: 'card-top' }, h('span', { class: 'num' }, String(item.index)), h('strong', {}, item.record.title || `Imported ${item.index}`), h('span', { class: 'badge' }, where(item.destination))),
        h('p', { class: 'excerpt' }, item.record.entry),
        h('div', { class: 'card-meta' }, item.record.keyphrases.map((k) => h('span', { class: 'mini' }, k))),
        warnings.filter((w) => w.entryIndex === item.index).map((w) => h('p', { class: 'issue warning small' }, icon('info', 14), h('span', {}, w.message))),
        item.conflict ? h('div', { class: 'conflict' }, h('span', {}, CONFLICT[item.conflict]), h('div', { class: 'segmented small' }, options.map((o) =>
          h('button', { type: 'button', class: d === o ? 'on' : '', 'aria-pressed': String(d === o), onClick: () => { decisions[item.index] = o; draw(); } }, o === 'skip' ? 'Skip' : o === 'replace' ? 'Replace' : 'Keep both')))) : null);
    }));
    summary.textContent = `${create} new · ${replace} replaced · ${skip} skipped`;
    go.disabled = create + replace === 0 || (warnings.length > 0 && !ack.checked);
  };
  ack.addEventListener('change', draw);
  go.addEventListener('click', () => {
    try {
      const plan = createImportPlan(p, decisions, defaultKin || null);
      store.importPlan(plan);
      close();
      toast(`${plural(plan.entries.length, 'entry', 'entries')} imported${plan.skipped ? `, ${plan.skipped} skipped` : ''}.`);
    } catch (e) { toast(`Nothing was imported. ${e.message}`, 'error'); }
  });

  const body = p.hasFatal
    ? fatal.map((d) => h('p', { class: 'issue error' }, icon('alert', 15), h('span', {}, d.line ? `Line ${d.line}: ` : d.entryIndex ? `Entry ${d.entryIndex}: ` : '', d.message)))
    : [
      needsDefault ? h('div', { class: 'field box' }, h('span', { class: 'label' }, p.missingKins.length ? 'Entries with no Kin, or of Kins not attached, go to' : 'Entries with no Kin go to'),
        h('select', { onChange: (e) => { defaultKin = e.target.value; draw(); } }, h('option', { value: '' }, 'No Kin (decide later)'), store.state.kins.map((k) => h('option', { value: k.id, selected: k.id === defaultKin }, k.name)))) : null,
      warnings.filter((w) => !w.entryIndex).map((w) => h('p', { class: 'issue warning' }, icon('info', 15), h('span', {}, w.message))),
      list,
      warnings.length ? h('label', { class: 'ack' }, ack, ` I read the ${plural(warnings.length, 'warning', 'warnings')} and want to import anyway.`) : null,
    ];
  const close = openSheet({
    title: `Import ${source}`,
    description: p.hasFatal ? 'The file has errors and nothing will be imported. Fix it and try again.' : `${p.format === 'backup' ? 'Backup' : `KJOURNAL/${p.version}`} · ${plural(p.items.length, 'entry', 'entries')}. Nothing is saved until you confirm.`,
    body,
    footer: p.hasFatal ? h('button', { type: 'button', class: 'btn primary', onClick: () => close() }, 'Close') : [summary, go],
    wide: true,
  });
  if (!p.hasFatal) draw();
}

const FORMATS = [['kjournal', 'KJOURNAL', 'Readable text you can import again.'], ['markdown', 'Checklist', 'A Markdown list for pasting into Kindroid one by one.'], ['json', 'JSON', 'KJOURNAL as JSON, for scripts.'], ['backup', 'Backup', 'Everything, with status and dates. Restore it with Import.']];

export function openExport(ctx) {
  const { store, ui } = ctx;
  const { journal, kins } = store.state;
  const inside = journal.entries.filter((e) => inCollection(e, ui.filter.collection));
  let format = 'kjournal';
  let scope = ui.filter.collection.kind === 'all' || !inside.length ? 'all' : 'collection';
  const box = h('textarea', { class: 'mono', rows: 10, readOnly: true, 'aria-label': 'Exported content', onFocus: (e) => e.target.select() });
  const formats = h('div', { class: 'segmented wrap', role: 'radiogroup', 'aria-label': 'Format' });
  const scopes = h('div', { class: 'segmented wrap', role: 'radiogroup', 'aria-label': 'What to export' });
  const hint = h('p', { class: 'hint' });
  const linkBtn = h('button', { type: 'button', class: 'btn ghost' }, icon('download', 15), 'Save link file');
  const text = () => {
    if (format === 'backup') return serializeJournal(store.state.journal);
    const records = toRecords(scope === 'all' ? journal.entries : inside, (id) => kinName(id, kins, journal.kinNames));
    return format === 'kjournal' ? serializeKJournalText(records) : format === 'json' ? serializeKJournalJson(records) : serializeMarkdown(records);
  };
  const draw = () => {
    fill(formats, FORMATS.map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(format === v), class: format === v ? 'on' : '', onClick: () => { format = v; draw(); } }, label)));
    fill(scopes, format === 'backup' ? [] : [['collection', `This collection (${inside.length})`], ['all', `Everything (${journal.entries.length})`]]
      .filter(([v]) => v === 'all' || ui.filter.collection.kind !== 'all')
      .map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(scope === v), class: scope === v ? 'on' : '', disabled: v === 'collection' && !inside.length, onClick: () => { scope = v; draw(); } }, label)));
    const link = EXPORT_FILES[format];
    linkBtn.hidden = !link;
    fill(hint, FORMATS.find(([v]) => v === format)[2], link ? ` Link file: ${link} (Kindroid → this app's settings → links).` : '');
    box.value = text();
  };
  linkBtn.addEventListener('click', async () => {
    linkBtn.disabled = true;
    try { await store.writeFile(EXPORT_FILES[format], box.value); toast(`${EXPORT_FILES[format]} saved. Its link is in this app's settings in Kindroid.`); }
    catch { toast('Could not save the file.', 'error'); }
    linkBtn.disabled = false;
  });
  openSheet({
    title: 'Export and backup',
    description: 'Copy it, or save the file behind the app\'s link in Kindroid.',
    body: [formats, scopes, hint, box],
    footer: [linkBtn, h('button', { type: 'button', class: 'btn primary', onClick: () => copyText(box.value, 'Copied.') }, icon('copy', 15), 'Copy')],
    wide: true,
  });
  draw();
}
