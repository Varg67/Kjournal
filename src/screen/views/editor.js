// One entry. Text fields are built once and never rebuilt while typing; what depends on them (counts, issues,
// keyphrase chips, status) is refreshed in place.
import { LIMITS } from '../../core/constants.js';
import { allowedStatuses } from '../../core/entry.js';
import { entryIssues } from '../../core/library.js';
import { contentLimit, validateEntry } from '../../core/rules.js';
import { comparisonForm, countChars, normalizeKeyphrase, normalizeTag } from '../../core/text.js';
import { kinName } from '../../core/document.js';
import { h, fill } from '../dom.js';
import { icon } from '../icons.js';
import { SAVE_LABEL, STATUS_HINT, STATUS_LABEL, shortDate } from '../texts.js';
import { confirmSheet, copyText, toast } from './sheet.js';

export function renderEditor(ctx, id) {
  const { store } = ctx;
  const get = () => store.state.journal.entries.find((e) => e.id === id);
  const edit = (patch) => store.edit(id, patch);
  const e0 = get();

  const save = h('span', { class: 'save' });
  const dates = h('p', { class: 'dates muted' });
  const kinBox = h('div', { class: 'field' });
  const scopeBox = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Entry type' });
  const status = h('div', { class: 'status-row', role: 'radiogroup', 'aria-label': 'Status' });
  const statusHint = h('p', { class: 'hint' });
  const count = h('span', { class: 'count' });
  const comfort = h('span', { class: 'comfort' }, h('span'));
  const chips = h('ul', { class: 'phrases', 'aria-label': 'Keyphrases' });
  const phraseCount = h('span', { class: 'count' });
  const issues = h('div', { class: 'issues' });
  const authorNote = h('p', { class: 'kin-note', hidden: true }, icon('feather', 14), 'Drafted by your Kin in a chat. Review it before adding it to Kindroid.');

  const title = h('input', { class: 'title-input', value: e0.title, placeholder: 'Entry title', 'aria-label': 'Title', maxlength: String(LIMITS.titleMaxChars * 2), onInput: (e) => edit({ title: e.target.value }) });
  const content = h('textarea', { class: 'content-input', value: e0.content, rows: 9, 'aria-label': 'Entry text',
    placeholder: 'Write it like a backstory paragraph: third person, concise, the facts the Kin should recall when a keyphrase comes up.',
    onInput: (e) => edit({ content: e.target.value }) });
  const tags = h('input', { value: e0.tags.join(', '), placeholder: 'memories, family, places', 'aria-label': 'Tags',
    onChange: (e) => edit({ tags: [...new Set(e.target.value.split(',').map(normalizeTag).filter(Boolean))] }) });
  const phrase = h('input', { placeholder: 'Type a keyphrase, then Enter', 'aria-label': 'New keyphrase', maxlength: String(LIMITS.keyphraseMaxChars + 20) });

  const addPhrase = () => {
    const k = normalizeKeyphrase(phrase.value);
    phrase.value = '';
    const e = get();
    if (!k || e.keyphrases.some((x) => comparisonForm(x) === comparisonForm(k))) { refreshPhraseCount(); return; }
    edit({ keyphrases: e.keyphrases.concat([k]) });
  };
  phrase.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addPhrase(); }
    else if (ev.key === 'Backspace' && !phrase.value && get().keyphrases.length) {
      ev.preventDefault();
      const list = get().keyphrases;
      phrase.value = list[list.length - 1];
      edit({ keyphrases: list.slice(0, -1) });
    }
  });
  phrase.addEventListener('input', () => refreshPhraseCount());
  phrase.addEventListener('blur', addPhrase);

  const refreshPhraseCount = () => {
    const n = countChars(phrase.value.trim());
    phraseCount.textContent = phrase.value ? `${n}/${LIMITS.keyphraseMaxChars}` : `${get().keyphrases.length}/${LIMITS.keyphraseMaxCount}`;
    phraseCount.className = `count${n > LIMITS.keyphraseMaxChars ? ' over' : ''}`;
  };

  // A part is rebuilt only when what it shows changed: rebuilding a button between mousedown and click (a field's
  // blur saves, which refreshes) would swallow the click.
  const shown = {};
  const changed = (part, key) => { if (shown[part] === key) return false; shown[part] = key; return true; };

  function refresh() {
    const e = get();
    if (!e) return;
    const { kins, journal } = store.state;
    save.className = `save s-${store.state.save}`;
    fill(save, h('span', { class: 'save-dot' }), SAVE_LABEL[store.state.save]);
    dates.textContent = `Created ${shortDate(e.createdAt)} · edited ${shortDate(e.updatedAt)}${e.markedInKindroidAt ? ` · in Kindroid since ${shortDate(e.markedInKindroidAt)}` : ''}`;
    authorNote.hidden = e.author !== 'kin';

    if (changed('scope', e.scope)) fill(scopeBox,
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(e.scope === 'kin'), class: e.scope === 'kin' ? 'on' : '', 'data-key': 'scope-kin', onClick: () => edit({ scope: 'kin' }) }, icon('user', 15), 'Kin'),
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(e.scope === 'global'), class: e.scope === 'global' ? 'on' : '', 'data-key': 'scope-global', onClick: () => edit({ scope: 'global', kinId: null }) }, icon('globe', 15), 'Global'));
    if (!changed('kin', [e.scope, e.kinId, kins.map((k) => k.id + k.name).join()].join('|'))) { /* unchanged */ } else if (e.scope === 'kin') {
      const options = [h('option', { value: '' }, 'No Kin')].concat(kins.map((k) => h('option', { value: k.id, selected: k.id === e.kinId }, k.name)));
      if (e.kinId && !kins.some((k) => k.id === e.kinId)) options.push(h('option', { value: e.kinId, selected: true }, `${kinName(e.kinId, kins, journal.kinNames)} (detached)`));
      fill(kinBox, h('label', { class: 'label', for: 'kin-select' }, 'Kin'), h('select', { id: 'kin-select', 'data-key': 'kin', onChange: (ev) => edit({ kinId: ev.target.value || null }) }, options));
    } else {
      fill(kinBox, h('p', { class: 'hint' }, icon('globe', 14), ' Global entries count for all your Kins: use them for world lore, not for one character.'));
    }

    const allowed = allowedStatuses(e);
    if (changed('status', e.status + allowed.join())) fill(status, ['draft', 'ready', 'inKindroid'].concat(e.status === 'outdated' ? ['outdated'] : []).map((s) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(e.status === s), class: `status s-${s}${e.status === s ? ' on' : ''}`, disabled: !allowed.includes(s), 'data-key': `st-${s}`,
        title: allowed.includes(s) ? STATUS_HINT[s] : 'Fix the errors first', onClick: () => store.setStatus(id, s) }, h('span', { class: `dot s-${s}` }), STATUS_LABEL[s])));
    statusHint.textContent = STATUS_HINT[e.status];

    const { chars } = validateEntry(e);
    count.textContent = `${chars} / ${contentLimit(e)}`;
    const pct = Math.min(100, (chars / contentLimit(e)) * 100);
    comfort.firstChild.style.width = `${pct}%`;
    comfort.firstChild.className = pct >= 100 ? 'over' : '';

    const all = entryIssues(e, journal.entries);
    const bad = new Set(all.filter((x) => x.severity === 'error' && x.index !== undefined).map((x) => x.index));
    const warn = new Set(all.filter((x) => x.severity === 'warning' && x.index !== undefined).map((x) => x.index));
    fill(chips, e.keyphrases.map((k, i) => h('li', { class: `phrase${bad.has(i) ? ' bad' : warn.has(i) ? ' warn' : ''}` },
      h('span', {}, k),
      h('button', { type: 'button', 'aria-label': `Remove ${k}`, 'data-key': `rm-${i}`, onClick: () => edit({ keyphrases: get().keyphrases.filter((_, j) => j !== i) }) }, icon('close', 13)))));
    phrase.disabled = e.keyphrases.length >= LIMITS.keyphraseMaxCount;
    phrase.placeholder = phrase.disabled ? `At most ${LIMITS.keyphraseMaxCount} keyphrases` : 'Type a keyphrase, then Enter';
    refreshPhraseCount();

    fill(issues, all.length
      ? all.map((x) => h('p', { class: `issue ${x.severity}` }, icon(x.severity === 'error' ? 'alert' : 'info', 15), h('span', {}, x.message)))
      : e.content.trim() ? h('p', { class: 'issue ok' }, icon('check', 15), h('span', {}, 'All good. Copy the text and keyphrases into Kindroid, then mark it "In Kindroid".')) : null);
  }

  const view = h('section', { class: 'editor' },
    h('header', { class: 'top' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back to the list', 'data-key': 'back', onClick: ctx.closeEntry }, icon('back')),
      save,
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn ghost small', onClick: () => copyText(get().content.trim(), 'Text copied.') }, icon('copy', 15), 'Text'),
      h('button', { type: 'button', class: 'btn ghost small', onClick: () => copyText(get().keyphrases.join('\n'), 'Keyphrases copied, one per line.') }, icon('copy', 15), 'Keyphrases'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Duplicate', title: 'Duplicate', onClick: () => { const c = store.duplicate(id); if (c) { toast('Copy made as a draft.'); ctx.openEntry(c.id); } } }, icon('layers')),
      h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Delete', title: 'Delete',
        onClick: () => confirmSheet({ title: 'Delete this entry?', description: `"${get().title || 'Untitled'}" leaves this app. If it is in the Kin's Journal in Kindroid, it stays there.`, confirm: 'Delete',
          onConfirm: () => { store.remove(id); ctx.closeEntry(); toast('Entry deleted.'); } }) }, icon('trash'))),
    h('div', { class: 'page' },
      title, authorNote, dates,
      h('div', { class: 'box' }, h('div', { class: 'field' }, h('span', { class: 'label' }, 'Type'), scopeBox), kinBox,
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Tags'), tags)),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Status'), status, statusHint),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Text', count), content, comfort),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Keyphrases', h('span', { class: 'count' }, `${LIMITS.keyphraseMinChars}–${LIMITS.keyphraseMaxChars} characters each`)),
        h('div', { class: 'phrase-box' }, chips, h('div', { class: 'phrase-input' }, phrase, phraseCount)),
        h('p', { class: 'hint' }, 'Kindroid looks for the exact phrase (any capitalization), only in your message. Prefer specific phrases to single common words.')),
      issues));
  refresh();
  return { view, refresh };
}
