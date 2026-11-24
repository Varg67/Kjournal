// The files Kindroid gets: the manifest, the generated screen and the install guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/core/constants.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('kin.json: the screen, the run and the two Kin actions; no grants', () => {
  const m = JSON.parse(read('kin.json'));
  assert.equal(m.kin, 1);
  assert.ok(m.name.length <= 40 && m.purpose.length <= 200);
  assert.deepEqual(m.run, { entry: 'node main.js', timeout: '1m' });
  assert.equal(m.screens[0].entry, 'screen/index.html');
  assert.deepEqual(m.actions.map((a) => [a.name, a.by]), [['save_journal_entry', ['kin']], ['read_journal', ['kin']]]);
  assert.equal(m.grants, undefined);
  assert.equal(m.triggers, undefined);
});

test('package.json has no dependencies (Kindroid installs the root lockfile at every run) and the same version', () => {
  const p = JSON.parse(read('package.json'));
  assert.equal(p.dependencies, undefined);
  assert.equal(p.devDependencies, undefined);
  assert.equal(p.version, APP_VERSION);
});

test('generated files are up to date', () => {
  execFileSync(process.execPath, ['scripts/build-screen.mjs', '--check'], { cwd: ROOT });
  execFileSync(process.execPath, ['scripts/build-sample.mjs', '--check'], { cwd: ROOT });
  execFileSync(process.execPath, ['scripts/build-install.mjs', '--check'], { cwd: ROOT });
});

test('each screen script is small enough for the Workshop agent to copy whole, and ends with its marker', () => {
  for (const [file, end] of [['screen/core.js', `// end of Journal core ${APP_VERSION}`], ['screen/app.js', `// end of Journal screen ${APP_VERSION}`]]) {
    const text = read(file);
    assert.ok(text.length < 60000, `${file} is ${text.length} characters`);
    assert.equal(text.trimEnd().split('\n').pop(), end);
  }
});
