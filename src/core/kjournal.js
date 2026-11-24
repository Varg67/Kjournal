// KJOURNAL: the text and JSON interchange format for bulk import and export (docs/kjournal.md). Version 2 has
// kin, scope and tags; version 1 files (with the old API's ai_id) are still read, and ai_id is dropped.
// Parsing is strict and never guesses: the first structural problem stops it.
import { validateEntry, cleanKeyphrases } from './rules.js';
import { comparisonForm, isRecord, nfc, normalizeKeyphrase, normalizeTag } from './text.js';
import { LIMITS } from './constants.js';

export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MARKERS = new Set(['@@JOURNAL', '@@KEYPHRASES', '@@ENTRY', '@@END']);
const TEXT_FIELDS = { 1: ['id', 'title', 'ai_id'], 2: ['id', 'title', 'kin', 'scope', 'tags'] };
const JSON_FIELDS = { 1: ['id', 'title', 'ai_id', 'entry', 'keyphrases'], 2: ['id', 'title', 'kin', 'scope', 'tags', 'entry', 'keyphrases'] };

const fatal = (code, message, extra = {}) => ({ severity: 'fatal', code, message, ...extra });
const warning = (code, message, extra = {}) => ({ severity: 'warning', code, message, ...extra });
const result = (format, version, records, diagnostics) => ({ format, version, records, diagnostics, hasFatal: diagnostics.some((d) => d.severity === 'fatal') });

/** Strict UTF-8 (one BOM allowed), line endings to \n. { text } or { diagnostic } */
export function decode(bytes) {
  if (bytes.byteLength > MAX_SOURCE_BYTES) return { diagnostic: fatal('source-too-large', 'The file is over 4 MB.') };
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body).replace(/\r\n?/g, '\n') };
  } catch {
    return { diagnostic: fatal('invalid-utf8', 'The file is not valid UTF-8.') };
  }
}

function trimLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return nfc(lines.slice(start, end).join('\n'));
}

/** A raw record into a normalized one, with the editor's own rules as diagnostics. */
function finish(raw, content) {
  const diagnostics = [];
  const at = { entryIndex: raw.index, ...(raw.line ? { line: raw.line } : {}) };
  let scope = 'kin';
  if (raw.scope !== undefined) {
    const v = raw.scope.trim().toLowerCase();
    if (v === 'global') scope = 'global';
    else if (v !== 'kin') diagnostics.push(fatal('invalid-scope', `scope must be "kin" or "global", not "${raw.scope}".`, at));
  }
  if (scope === 'global' && raw.kin) diagnostics.push(fatal('global-with-kin', 'A global entry cannot also have a kin.', at));
  if (raw.legacyAiId) diagnostics.push(warning('legacy-ai-id', 'ai_id belongs to the old API and is ignored. Choose the Kin when importing.', at));
  const record = {
    id: raw.id && raw.id.trim() ? nfc(raw.id.trim()) : undefined,
    title: raw.title && raw.title.trim() ? nfc(raw.title.trim()) : undefined,
    kin: raw.kin && raw.kin.trim() ? nfc(raw.kin.trim()) : undefined,
    scope,
    tags: [...new Set((raw.tags || []).map(normalizeTag).filter(Boolean))],
    entry: content,
    keyphrases: raw.keyphrases.map(normalizeKeyphrase),
  };
  const probe = { title: 'x', scope, kinId: 'x', content, keyphrases: record.keyphrases };
  for (const issue of validateEntry(probe).issues) {
    if (issue.field === 'title' || issue.field === 'kin') continue;
    diagnostics.push(issue.severity === 'error' ? fatal(issue.code, issue.message, at) : warning(issue.code, issue.message, at));
  }
  return { record, diagnostics };
}

function crossChecks(records) {
  const out = [];
  const ids = new Map();
  const texts = new Map();
  const phrases = new Map();
  records.forEach((r, i) => {
    const n = i + 1;
    if (r.id) { if (ids.has(r.id)) out.push(fatal('duplicate-id', `The id repeats entry ${ids.get(r.id)}.`, { entryIndex: n })); else ids.set(r.id, n); }
    if (texts.has(r.entry)) out.push(warning('duplicate-content', `Same text as entry ${texts.get(r.entry)}.`, { entryIndex: n })); else texts.set(r.entry, n);
    const bucket = r.scope === 'global' ? 'global' : `kin:${comparisonForm(r.kin || '')}`;
    for (const k of cleanKeyphrases(r.keyphrases)) {
      const key = `${bucket}\u0000${comparisonForm(k)}`;
      if (phrases.has(key) && phrases.get(key) !== n) out.push(warning('keyphrase-collision', `"${k}" is also in entry ${phrases.get(key)} for the same Kin.`, { entryIndex: n }));
      else phrases.set(key, n);
    }
  });
  if (records.length > LIMITS.entriesPerType) out.push(warning('over-capacity', `${records.length} entries: Kindroid keeps at most ${LIMITS.entriesPerType} per type.`));
  return out;
}

export function parseKJournalText(bytes) {
  const decoded = decode(bytes);
  if (decoded.diagnostic) return result('text', 2, [], [decoded.diagnostic]);
  const lines = decoded.text.split('\n');
  const version = lines[0] === 'KJOURNAL/2' ? 2 : lines[0] === 'KJOURNAL/1' ? 1 : 0;
  if (!version) {
    const known = /^KJOURNAL\/\d+$/.test(lines[0] || '');
    return result('text', 2, [], [fatal(known ? 'unsupported-version' : 'invalid-signature', known ? 'This KJOURNAL version is not supported.' : 'The first line must be exactly KJOURNAL/2 (or KJOURNAL/1).', { line: 1 })]);
  }
  const diagnostics = [];
  const records = [];
  let state = 'between';
  let block = null;
  let seen = null;
  const stop = (code, message, line) => { diagnostics.push(fatal(code, message, { line, ...(block ? { entryIndex: block.index } : {}) })); return true; };
  let stopped = false;

  for (let i = 1; i < lines.length && !stopped; i += 1) {
    const line = lines[i];
    const n = i + 1;
    if (state === 'between') {
      if (!line.trim() || line.startsWith('#')) continue;
      if (line === '@@JOURNAL') { block = { index: records.length + 1, line: n, keyphrases: [], content: [] }; seen = new Set(); state = 'meta'; continue; }
      stopped = stop('text-outside-block', 'Outside a block only blank lines, # comments or @@JOURNAL are allowed.', n);
      continue;
    }
    if (line === '@@JOURNAL') { stopped = stop('nested-journal', 'A new @@JOURNAL started before this block\'s @@END.', n); continue; }
    if (state === 'meta') {
      if (line === '@@KEYPHRASES') { state = 'phrases'; continue; }
      if (MARKERS.has(line)) { stopped = stop('missing-keyphrases', 'The @@KEYPHRASES section is required before the text.', n); continue; }
      const m = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
      if (!m) { stopped = stop('invalid-metadata', 'Metadata lines are name: value.', n); continue; }
      const [, name, value] = m;
      if (!TEXT_FIELDS[version].includes(name)) { stopped = stop('unknown-metadata', `"${name}" is not a field of KJOURNAL/${version}.`, n); continue; }
      if (seen.has(name)) { stopped = stop('duplicate-metadata', `"${name}" appears twice.`, n); continue; }
      if (!value.trim()) { stopped = stop('empty-metadata', `"${name}" is empty. Leave the line out instead.`, n); continue; }
      seen.add(name);
      if (name === 'tags') block.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
      else if (name === 'ai_id') block.legacyAiId = true;
      else block[name] = value;
      continue;
    }
    if (state === 'phrases') {
      if (line === '@@ENTRY') { state = 'entry'; continue; }
      if (MARKERS.has(line)) { stopped = stop('missing-entry', 'The @@ENTRY section is required after the keyphrases.', n); continue; }
      if (!line.startsWith('- ')) { stopped = stop('invalid-keyphrase-line', 'Each keyphrase is one line starting with "- ".', n); continue; }
      block.keyphrases.push(line.slice(2));
      continue;
    }
    if (line === '@@END') {
      const done = finish(block, trimLines(block.content));
      records.push(done.record);
      diagnostics.push(...done.diagnostics);
      block = null;
      state = 'between';
      continue;
    }
    if (line === '@@KEYPHRASES' || line === '@@ENTRY') { stopped = stop('unescaped-marker', `A marker inside the text: write \\${line} for a literal line.`, n); continue; }
    block.content.push(line.startsWith('\\') && MARKERS.has(line.slice(1)) ? line.slice(1) : line);
  }
  if (!stopped && state !== 'between') {
    stop('unexpected-eof', state === 'meta' ? 'The file ended before @@KEYPHRASES.' : state === 'phrases' ? 'The file ended before @@ENTRY.' : 'The file ended without the last block\'s @@END.', lines.length);
  }
  if (!stopped && state === 'between' && !records.length) diagnostics.push(fatal('no-entries', 'The file has no complete @@JOURNAL block.', { line: 1 }));
  diagnostics.push(...crossChecks(records));
  return result('text', version, records, diagnostics);
}

export function parseKJournalJson(bytes) {
  const decoded = decode(bytes);
  if (decoded.diagnostic) return result('json', 2, [], [decoded.diagnostic]);
  let doc;
  try { doc = JSON.parse(decoded.text); } catch { return result('json', 2, [], [fatal('invalid-json', 'The file is not valid JSON.')]); }
  if (!isRecord(doc) || doc.format !== 'kjournal') return result('json', 2, [], [fatal('invalid-document', 'The JSON needs "format": "kjournal".')]);
  if (doc.version !== 1 && doc.version !== 2) return result('json', 2, [], [fatal('unsupported-version', 'This KJOURNAL version is not supported.')]);
  const version = doc.version;
  const extra = Object.keys(doc).filter((k) => !['format', 'version', 'entries'].includes(k));
  if (extra.length) return result('json', version, [], [fatal('unknown-property', `Unknown properties: ${extra.join(', ')}.`)]);
  if (!Array.isArray(doc.entries) || !doc.entries.length) return result('json', version, [], [fatal('no-entries', '"entries" must be a list with at least one entry.')]);
  const diagnostics = [];
  const records = [];
  doc.entries.forEach((value, i) => {
    const index = i + 1;
    const bad = (message) => diagnostics.push(fatal('invalid-entry', message, { entryIndex: index }));
    if (!isRecord(value)) return bad('Each entry must be an object.');
    const unknown = Object.keys(value).filter((k) => !JSON_FIELDS[version].includes(k));
    if (unknown.length) return bad(`Unknown properties: ${unknown.join(', ')}.`);
    if (typeof value.entry !== 'string') return bad('"entry" is required and must be text.');
    if (!Array.isArray(value.keyphrases) || value.keyphrases.some((k) => typeof k !== 'string')) return bad('"keyphrases" must be a list of text.');
    if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((t) => typeof t !== 'string'))) return bad('"tags" must be a list of text.');
    const text = (key) => {
      const v = value[key];
      if (v === undefined || (key === 'ai_id' && v === null)) return undefined;
      if (typeof v !== 'string' || !v.trim()) { bad(`"${key}" must be non-empty text.`); return undefined; }
      return v;
    };
    const raw = { index, id: text('id'), title: text('title'), kin: text('kin'), scope: text('scope'), tags: value.tags || [], legacyAiId: version === 1 && typeof value.ai_id === 'string', keyphrases: value.keyphrases };
    const done = finish(raw, nfc(value.entry.replace(/\r\n?/g, '\n')).trim());
    records.push(done.record);
    diagnostics.push(...done.diagnostics);
  });
  if (diagnostics.some((d) => d.code === 'invalid-entry')) return result('json', version, [], diagnostics);
  diagnostics.push(...crossChecks(records));
  return result('json', version, records, diagnostics);
}

/** Entries into interchange records; `nameOf(kinId)` gives the Kin's name written in the file. */
export function toRecords(entries, nameOf) {
  return entries.map((e) => ({
    id: e.id,
    title: e.title.trim() || undefined,
    kin: e.scope === 'kin' && e.kinId ? nameOf(e.kinId) : undefined,
    scope: e.scope,
    tags: e.tags.slice(),
    entry: nfc(e.content.replace(/\r\n?/g, '\n').trim()),
    keyphrases: cleanKeyphrases(e.keyphrases),
  }));
}

const flat = (value) => nfc(String(value).replace(/\s+/g, ' ').trim());

export function serializeKJournalText(records) {
  const blocks = records.map((r) => {
    const meta = [];
    if (r.id) meta.push(`id: ${flat(r.id)}`);
    if (r.title) meta.push(`title: ${flat(r.title)}`);
    if (r.scope === 'global') meta.push('scope: global');
    else if (r.kin) meta.push(`kin: ${flat(r.kin)}`);
    const tags = r.tags.map((t) => flat(t.replace(/,/g, ' '))).filter(Boolean);
    if (tags.length) meta.push(`tags: ${tags.join(', ')}`);
    const body = r.entry.split('\n').map((l) => (MARKERS.has(l) ? `\\${l}` : l));
    return ['@@JOURNAL', ...meta, '@@KEYPHRASES', ...r.keyphrases.map((k) => `- ${k}`), '@@ENTRY', ...body, '@@END'].join('\n');
  });
  return `KJOURNAL/2\n\n${blocks.join('\n\n')}\n`;
}

export function serializeKJournalJson(records) {
  const entries = records.map((r) => {
    const out = {};
    if (r.id) out.id = r.id;
    if (r.title) out.title = r.title;
    if (r.scope === 'global') out.scope = 'global';
    else if (r.kin) out.kin = r.kin;
    if (r.tags.length) out.tags = r.tags;
    out.entry = r.entry;
    out.keyphrases = r.keyphrases;
    return out;
  });
  return `${JSON.stringify({ format: 'kjournal', version: 2, entries }, null, 2)}\n`;
}

/** A checklist for pasting entries into Kindroid by hand. */
export function serializeMarkdown(records) {
  const groups = new Map();
  for (const r of records) {
    const g = r.scope === 'global' ? 'Global' : r.kin || 'No Kin';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const lines = ['# Journal Entries', ''];
  for (const [g, list] of groups) {
    lines.push(`## ${g}`, '');
    for (const r of list) lines.push(`### [ ] ${r.title || 'Untitled'}`, '', `**Keyphrases:** ${r.keyphrases.join(' · ')}`, '', ...r.entry.split('\n').map((l) => `> ${l}`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
