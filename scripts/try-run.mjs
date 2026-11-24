// Runs the real main.js with Kindroid's own kin.mjs in mock mode (the guide's KIN_MOCK): nothing is sent, every call
// is written to a log, and files are kept beside it so one run's save is the next run's read.
//   curl -fsSO https://downloads.kinusercontent.com/workshop/kin.mjs
//   npm run try                 a save_journal_entry, then a read_journal
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KIN = process.env.KIN_BIN || join(ROOT, 'kin.mjs');
if (!existsSync(KIN)) {
  console.error('kin.mjs not found. Download it first: curl -fsSO https://downloads.kinusercontent.com/workshop/kin.mjs');
  process.exit(1);
}
const log = join(mkdtempSync(join(tmpdir(), 'journal-try-')), 'kin.jsonl');
const env = { ...process.env, KIN_BIN: KIN, KIN_MOCK: log };
const events = [
  { trigger: 'action', action: 'save_journal_entry', kin: 'mock-kin', input: { title: 'Marta', entry: 'Marta is Alexi\'s older sister and lives in Lisbon.', keyphrases: ['Marta', 'my sister'] } },
  { trigger: 'action', action: 'read_journal', kin: 'mock-kin', input: { query: 'Marta' } },
];
for (const event of events) {
  console.log(`\n> ${event.action}`);
  execFileSync(process.execPath, [join(ROOT, 'main.js')], { input: JSON.stringify(event), env, stdio: ['pipe', 'inherit', 'inherit'] });
}
console.log(`\nkin calls (${log}):`);
for (const line of readFileSync(log, 'utf8').trim().split('\n')) {
  const call = JSON.parse(line);
  console.log(`  ${call.method} ${call.path}${typeof call.body === 'string' && call.body.startsWith('{') ? `  ${call.body.slice(0, 160)}` : ''}`);
}
