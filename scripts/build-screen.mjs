// Builds screen/app.js: the screen as ONE classic script, from the ES modules in src/screen and src/core.
// (The same bundler as Clotheskin.)
//   node scripts/build-screen.mjs          writes screen/app.js
//   node scripts/build-screen.mjs --check  fails if screen/app.js is not what the sources give (a test runs this)
//
// Why: the Kindroid frame also runs on phones and older Safari ("Plain old JavaScript so older Safari runs it", as a
// published program puts it), and every screen file is uploaded one by one. One classic script avoids both risks:
// no module loading, no top-level await, one file. No dependency either: the sources keep to a small, checked subset
// of module syntax (named imports and exports), and each module becomes a function in a tiny registry.
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule, writeOrCheck } from './lib/generated.mjs';
import { APP_VERSION } from '../src/core/constants.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = 'src/screen/main.js';
const OUT = 'screen/app.js';

// Syntax and APIs newer than Safari 14 (or not needed in a screen) are refused, with the module that uses them.
/** @type {Array<[RegExp, string]>} */
const REFUSED = [
  [/(^|[^\w$.'"`])#[A-Za-z_$][\w$]*\s*[(=;]|this\.#/m, 'private class members (Safari 15)'],
  [/\.at\(/, 'Array.prototype.at (Safari 15.4)'],
  [/Object\.hasOwn\b/, 'Object.hasOwn (Safari 15.4)'],
  [/\bstructuredClone\b/, 'structuredClone (Safari 15.4)'],
  [/\.findLast(Index)?\(/, 'findLast (Safari 15.4)'],
  [/\bstatic\s*\{/, 'class static blocks (Safari 16.4)'],
  [/\bimport\s*\(/, 'dynamic import'],
  [/\b(localStorage|sessionStorage|document\.cookie|indexedDB)\b/, 'browser storage (a Kindroid screen cannot use it)'],
  [/\binnerHTML\s*=(?!\s*`<svg)/, 'innerHTML with anything but the built-in icons (saved data goes in as text)'],
];

const posix = (p) => p.split(sep).join('/');

/**
 * The sources' comments are for whoever reads the code; the screen's one file only runs. Lines that are only a comment
 * (// or a block that starts its line) go; a comment after code on a line stays. Nothing inside a line is touched, so
 * a regular expression such as /\*[^*]+\*\// cannot be mistaken for a comment. Keeps screen/app.js small for the
 * Kindroid agent that copies it (a test holds it under 90,000 characters).
 */
export function stripCommentLines(code) {
  const out = [];
  let inBlock = false;
  for (const line of code.split('\n')) {
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      inBlock = false;
      const rest = line.slice(end + 2);
      if (rest.trim()) out.push(rest);
      continue;
    }
    if (/^\s*\/\//.test(line)) continue;
    const block = line.match(/^\s*\/\*/);
    if (block) {
      const end = line.indexOf('*/', block[0].length);
      if (end === -1) { inBlock = true; continue; }
      const rest = line.slice(end + 2);
      if (rest.trim()) out.push(rest);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function transform(rel, code) {
  const deps = [];
  const names = [];
  let out = stripCommentLines(code).replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm, (m, list, spec) => {
    if (!spec.startsWith('.')) throw new Error(`${rel}: only relative imports are bundled (${spec})`);
    const dep = posix(relative(ROOT, join(ROOT, dirname(rel), spec)));
    deps.push(dep);
    const fields = list.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': '));
    return `const { ${fields.join(', ')} } = __req(${JSON.stringify(dep)});`;
  });
  out = out.replace(/^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (m, kind, name) => { names.push(name); return `${kind} ${name}`; });
  out = out.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (m, list) => { list.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => names.push(n)); return ''; });
  const left = out.match(/^\s*(import|export)\b.*$/m);
  if (left) throw new Error(`${rel}: unsupported module syntax: ${left[0].trim()}`);
  for (const [re, what] of REFUSED) if (re.test(out)) throw new Error(`${rel}: ${what} is not allowed in the screen`);
  return { deps, code: `__def(${JSON.stringify(rel)}, function () {\n${out.trim()}\nreturn { ${names.join(', ')} };\n});` };
}

/**
 * Each file's last line, the same for every build of a version: a copy that lost its end (the Kindroid agent copying
 * a long file) is told apart by asking for its last line (COMO-INSTALAR.md, step 5).
 */
export const SCREEN_END = `// end of Journal screen ${APP_VERSION}`;
export const CORE_END = `// end of Journal core ${APP_VERSION}`;

// Two classic scripts share one module registry: screen/core.js (src/core: rules, formats, the journal file) and
// screen/app.js (src/screen: the page). Two files of about 40k characters copy more safely than one of 90k.
const PRELUDE = `var __r = window.__journalModules || (window.__journalModules = { defs: {}, mods: {} });
function __def(p, f) { __r.defs[p] = f; }
function __req(p) { if (!(p in __r.mods)) { if (!__r.defs[p]) throw new Error('missing module ' + p); __r.mods[p] = null; __r.mods[p] = __r.defs[p](); } return __r.mods[p]; }`;

function collect() {
  const seen = new Map();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.set(rel, null);
    const t = transform(rel, readFileSync(join(ROOT, rel), 'utf8'));
    seen.set(rel, t.code);
    t.deps.forEach(visit);
  };
  visit(ENTRY);
  return seen;
}

export function buildScreen() {
  const seen = collect();
  const names = [...seen.keys()].sort();
  const core = names.filter((k) => k.startsWith('src/core/'));
  const page = names.filter((k) => !k.startsWith('src/core/'));
  const file = (title, list, tail, end) => `// Journal ${title}. GENERATED by scripts/build-screen.mjs from ${list.length} modules in src/: do not edit,
// edit the sources and run npm run build. A classic script (no modules): the Kindroid frame also runs on older Safari.
(function () {
'use strict';
${PRELUDE}

${list.map((k) => seen.get(k)).join('\n\n')}
${tail}})();
${end}
`;
  return {
    core: file('screen, shared core (load before app.js)', core, '', CORE_END),
    app: file('screen', page, `\n__req(${JSON.stringify(ENTRY)}).boot();\n`, SCREEN_END),
  };
}

if (isMainModule(import.meta.url)) {
  const out = buildScreen();
  writeOrCheck('screen/core.js', out.core);
  writeOrCheck(OUT, out.app);
}
