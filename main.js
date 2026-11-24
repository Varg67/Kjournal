// The run's entry (kin.json: "run": { "entry": "node main.js" }). Kindroid starts it when the Kin uses an action; the
// trigger arrives as JSON on stdin. Every path, crashes included, ends with exactly one `kin end`.
import { createKin } from './run/kin.js';
import { runProgram } from './run/program.js';

const MAX_STDIN_CHARS = 1024 * 1024; // an action's input is at most 16,000 characters
const WATCHDOG_MS = Number(process.env.JOURNAL_WATCHDOG_MS) || 50000; // kin.json gives a run 1 minute

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    data += chunk;
    if (data.length > MAX_STDIN_CHARS) throw new Error('too large');
  }
  return data;
}

const kin = createKin();
let ended = false;
async function end({ ok, message }) {
  if (ended) return;
  ended = true;
  clearTimeout(watchdog);
  try {
    await kin.end(message, { failed: !ok });
  } catch (e) {
    console.error(`[journal] kin end failed: ${e.message}`);
    process.exitCode = 1;
  }
}
const watchdog = setTimeout(async () => {
  await end({ ok: false, message: 'Journal ran out of time. Try again in a moment.' });
  process.exit();
}, WATCHDOG_MS);

let outcome;
try {
  let event;
  try { event = JSON.parse((await readStdin()) || '{}'); } catch { event = null; }
  outcome = event ? await runProgram({ event, kin }) : { ok: false, message: 'Journal was started with input that is not a trigger.' };
} catch (e) {
  outcome = { ok: false, message: `Journal could not read or save its files: ${e.message}.` };
}
await end(outcome);
