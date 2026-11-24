// The list: the open collection, search, filters and the entries as cards.
import { LIMITS } from '../../core/constants.js';
import { allTags, filterEntries, inCollection } from '../../core/library.js';
import { kinName } from '../../core/document.js';
import { h, fill } from '../dom.js';
import { icon } from '../icons.js';
import { FILTERS, STATUS_LABEL, collectionTitle, excerpt, plural, shortDate } from '../texts.js';

export function renderList(ctx) {
  const { store, ui } = ctx;
  const { journal, kins } = store.state;
  const inside = journal.entries.filter((e) => inCollection(e, ui.filter.collection));
  const typed = ui.filter.collection.kind === 'kin' || ui.filter.collection.kind === 'global';
  const cards = h('ul', { class: 'cards' });

  const fillCards = () => {
    const shown = filterEntries(journal.entries, ui.filter, ctx.problems());
    fill(cards, shown.length ? shown.map((e) => card(ctx, e)) : h('li', { class: 'empty' },
      inside.length ? 'Nothing matches these filters.' : [icon('feather', 28), h('p', {}, 'No entries here yet.'), h('button', { type: 'button', class: 'btn ghost', onClick: ctx.newEntry }, 'Write the first one')]));
  };

  const tags = allTags(inside);
  const view = h('section', { class: 'list' },
    h('header', { class: 'top' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Collections and files', 'data-key': 'menu', onClick: ctx.openMenu }, icon('menu')),
      h('div', { class: 'top-title' }, h('h1', {}, collectionTitle(ui.filter.collection, kins, journal.kinNames)), h('span', { class: 'muted' }, plural(inside.length, 'entry', 'entries'))),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Test triggers', title: 'Test triggers', onClick: ctx.openLab }, icon('spark')),
      h('button', { type: 'button', class: 'btn primary small', 'data-key': 'new', onClick: ctx.newEntry }, icon('plus', 16), 'New')),
    typed ? h('div', { class: 'capacity', title: `Kindroid keeps up to ${LIMITS.entriesPerType} entries per type` },
      h('div', { class: 'bar' }, h('span', { style: `width:${Math.min(100, (inside.length / LIMITS.entriesPerType) * 100)}%` })),
      h('small', {}, `${inside.length} / ${LIMITS.entriesPerType}`)) : null,
    h('label', { class: 'search' }, icon('search', 16),
      h('input', { type: 'search', placeholder: 'Search title, text, keyphrase…', value: ui.filter.query, 'aria-label': 'Search', 'data-key': 'search',
        onInput: (e) => { ui.filter.query = e.target.value; fillCards(); } })),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Status' }, FILTERS.map(([value, label]) =>
      h('button', { type: 'button', class: `chip${ui.filter.status === value ? ' on' : ''}`, 'aria-pressed': String(ui.filter.status === value), 'data-key': `f-${value}`,
        onClick: () => { ui.filter.status = value; ctx.render(); } }, label))),
    tags.length ? h('div', { class: 'chips tags', role: 'group', 'aria-label': 'Tags' }, tags.map((t) =>
      h('button', { type: 'button', class: `chip tag${ui.filter.tag === t ? ' on' : ''}`, 'aria-pressed': String(ui.filter.tag === t), 'data-key': `t-${t}`,
        onClick: () => { ui.filter.tag = ui.filter.tag === t ? null : t; ctx.render(); } }, `#${t}`))) : null,
    cards);
  fillCards();
  return view;
}

function card(ctx, e) {
  const { store, ui } = ctx;
  const showKin = ui.filter.collection.kind === 'all';
  return h('li', {}, h('button', { type: 'button', class: 'card', 'data-key': `e-${e.id}`, onClick: () => ctx.openEntry(e.id) },
    h('div', { class: 'card-top' },
      h('span', { class: `dot s-${e.status}`, title: STATUS_LABEL[e.status] }),
      h('strong', { class: e.title.trim() ? '' : 'untitled' }, e.title.trim() || 'Untitled'),
      e.author === 'kin' && e.status === 'draft' ? h('span', { class: 'by-kin', title: 'Written by your Kin' }, icon('feather', 14, 'Written by your Kin')) : null,
      ctx.problems().has(e.id) ? h('span', { class: 'warn-mark', title: 'Has warnings' }, icon('alert', 14, 'Has warnings')) : null),
    h('p', { class: 'excerpt' }, excerpt(e.content) || 'No text'),
    h('div', { class: 'card-meta' },
      e.keyphrases.slice(0, 3).map((k) => h('span', { class: 'mini' }, k)),
      e.keyphrases.length > 3 ? h('span', { class: 'muted' }, `+${e.keyphrases.length - 3}`) : null,
      h('span', { class: 'grow' }),
      showKin ? h('span', { class: 'card-kin' }, e.scope === 'global' ? 'Global' : kinName(e.kinId, store.state.kins, store.state.journal.kinNames)) : null,
      h('time', { datetime: e.updatedAt }, shortDate(e.updatedAt)))));
}

