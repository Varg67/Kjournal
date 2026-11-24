#!/usr/bin/env node
// A stand-in for the `kin` command in a run, for tests: files live in FAKE_KIN_DIR, every call is logged to
// FAKE_KIN_DIR/calls.jsonl, and a missing file answers like kin does ("kin: 404 ..." on stderr, exit 1).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dir = process.env.FAKE_KIN_DIR;
const [cmd, ...args] = process.argv.slice(2);
appendFileSync(join(dir, 'calls.jsonl'), `${JSON.stringify([cmd, ...args])}\n`);
const file = (p) => join(dir, 'files', p);
if (process.env.FAKE_KIN_FAIL === cmd) { console.error('kin: 503 Service Unavailable'); process.exit(75); }
if (cmd === 'files' && args[0] === 'get') {
  if (!existsSync(file(args[1]))) { console.error('kin: 404 Not found'); process.exit(1); }
  process.stdout.write(readFileSync(file(args[1])));
} else if (cmd === 'files' && args[0] === 'put') {
  mkdirSync(dirname(file(args[1])), { recursive: true });
  writeFileSync(file(args[1]), readFileSync(0));
} else if (cmd === 'end') {
  writeFileSync(join(dir, 'end.json'), JSON.stringify({ failed: args[0] === '--failed', message: args[args.length - 1] }));
} else { console.error(`kin: unknown ${cmd}`); process.exit(1); }
