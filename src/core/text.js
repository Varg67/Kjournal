// Text helpers shared by the run and the screen.

const WHITESPACE = /\s+/gu;

/** Characters as a person counts them (code points, so an emoji is one). */
export const countChars = (value) => Array.from(value).length;

export const nfc = (value) => String(value).normalize('NFC');

/** Trimmed, inner whitespace collapsed: Kindroid matches a keyphrase verbatim. */
export const normalizeKeyphrase = (value) => nfc(String(value).trim().replace(WHITESPACE, ' '));

/** The form used to decide whether two phrases are "the same": case-insensitive, compatibility-normalized. */
export const comparisonForm = (value) => String(value).normalize('NFKC').toLowerCase().trim().replace(WHITESPACE, ' ');

export const normalizeTag = (value) => nfc(String(value).trim().replace(WHITESPACE, ' ')).toLowerCase();

/** One line, at most `max` characters, for kin end and similar. */
export function oneLine(value, max) {
  const line = String(value).replace(WHITESPACE, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export const isTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Random id without crypto.randomUUID (Safari 15.4+); getRandomValues exists in Node 22 and every screen browser. */
export function newId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A strictly later ISO time than `previous`, so two edits in one millisecond are still ordered. */
export function nextTime(previous, now = new Date()) {
  const current = now.toISOString();
  if (!previous || current > previous) return current;
  const t = Date.parse(previous);
  return Number.isFinite(t) ? new Date(t + 1).toISOString() : current;
}
