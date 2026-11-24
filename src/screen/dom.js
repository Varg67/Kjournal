// Tiny DOM helpers. Saved data always goes in as text nodes, never as HTML (the guide: "Put anything that came from
// saved data on the page as text, never as HTML").

/** h('button', { class, onClick, ... }, ...children). Handlers are onXxx; the rest are attributes. */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null && v !== false) setAttr(el, k, v);
  append(el, children);
  return el;
}

const PROPS = new Set(['checked', 'disabled', 'value', 'selected', 'readOnly']);

function setAttr(el, k, v) {
  if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
  else if (k === 'class') el.className = v;
  else if (PROPS.has(k)) el[k] = v;
  else el.setAttribute(k, v === true ? '' : String(v));
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Replaces the children of `el`. */
export function fill(el, ...children) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return append(el, children);
}

/** Runs `fn` (which rebuilds `root`) and gives focus back to the control with the same data-key. */
export function keepFocus(root, fn) {
  const active = document.activeElement;
  const key = active && root.contains(active) ? active.getAttribute('data-key') : null;
  fn();
  if (!key) return;
  const next = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (next) next.focus({ preventScroll: true });
}
