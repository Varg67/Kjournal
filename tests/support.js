import { readFileSync } from 'node:fs';
import { createEntry } from '../src/core/entry.js';

export const fixture = (path) => new Uint8Array(readFileSync(new URL(path, import.meta.url)));
export const bytes = (text) => new TextEncoder().encode(text);
export const entry = (overrides = {}) => createEntry({ title: 'Test', kinId: 'kin-a', content: 'Some entry with enough text.', keyphrases: ['test phrase'], ...overrides });

/** The program's folder in memory, with the run's kin functions. */
export function memoryKin(initial = {}) {
  const files = new Map(Object.entries(initial));
  return { files, get: async (p) => (files.has(p) ? files.get(p) : null), put: async (p, t) => { files.set(p, t); } };
}
