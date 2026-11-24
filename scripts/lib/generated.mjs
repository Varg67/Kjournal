// The last step of every generator (screen/app.js, kin.json, the real-Kin test script): write the file, or with
// --check on the command line only compare it with what the sources give (npm run build:check, and a test each).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Whether the module at `url` (its import.meta.url) is the script node was started with. */
export const isMainModule = (url) => Boolean(process.argv[1]) && fileURLToPath(url) === process.argv[1];

/** Writes `text` to the repository file `path`; with --check, ends with exit code 1 when the file is not `text`. */
export function writeOrCheck(path, text) {
  const target = new URL(`../../${path}`, import.meta.url);
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(target, 'utf8'); } catch { /* missing: out of date as well */ }
    if (current !== text) {
      console.error(`${path} is out of date: run npm run build`);
      process.exit(1);
    }
    return;
  }
  writeFileSync(target, text);
  console.log(`${path} written (${text.length} characters)`);
}
