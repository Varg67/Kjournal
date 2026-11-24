// Bottom sheets (no <dialog>: Safari 15.4+), toasts, and the copy fallback.
import { h, fill } from '../dom.js';
import { icon } from '../icons.js';

let layer = null;
let toasts = null;

export function mountLayers(root) {
  layer = h('div', { class: 'sheet-layer', hidden: true });
  toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  root.append(layer, toasts);
}

/** Opens a sheet; returns close(). `body` and `footer` are nodes or arrays of nodes. */
export function openSheet({ title, description, body, footer, onClose, wide = false }) {
  const previous = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    layer.hidden = true;
    fill(layer);
    if (previous && previous.focus) previous.focus({ preventScroll: true });
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const panel = h('section', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'sheet-head' },
      h('div', {}, h('h2', {}, title), description ? h('p', { class: 'sheet-desc' }, description) : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onClick: close }, icon('close'))),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('footer', { class: 'sheet-foot' }, footer) : null);
  fill(layer, h('div', { class: 'sheet-backdrop', onClick: close }), panel);
  layer.hidden = false;
  const first = panel.querySelector('textarea, input, select, .sheet-body button, .sheet-foot button');
  if (first) first.focus({ preventScroll: true });
  return close;
}

export function toast(text, tone = 'ok') {
  const node = h('div', { class: `toast toast-${tone}` }, icon(tone === 'error' ? 'alert' : tone === 'warn' ? 'info' : 'check', 16), h('span', {}, text));
  toasts.append(node);
  while (toasts.children.length > 3) toasts.firstChild.remove();
  setTimeout(() => node.remove(), tone === 'error' ? 7000 : 3200);
}

export function confirmSheet({ title, description, confirm, danger = true, onConfirm }) {
  const close = openSheet({
    title, description,
    footer: [
      h('button', { type: 'button', class: 'btn ghost', onClick: () => close() }, 'Cancel'),
      h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => { close(); onConfirm(); } }, confirm),
    ],
  });
}

/** Copies text; when the frame does not allow it, shows the text selected for a manual copy. */
export async function copyText(text, done) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
  if (!ok) {
    const area = h('textarea', { class: 'offscreen', readOnly: true, value: text });
    document.body.append(area);
    area.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
  }
  if (ok) { toast(done); return; }
  const box = h('textarea', { class: 'mono', rows: 8, readOnly: true, value: text, onFocus: (e) => e.target.select() });
  const close = openSheet({ title: 'Copy', description: 'Kindroid did not let the app copy by itself. The text is selected: copy it with your device.', body: box, footer: h('button', { type: 'button', class: 'btn primary', onClick: () => close() }, 'Done') });
  box.focus();
  box.select();
}
