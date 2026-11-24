// The `kin` command inside a run (Kindroid guide: "Inside a run the kin command is already there"). This is the only
// file that knows how it is called; run/program.js gets these functions and never spawns anything, so the same logic
// also runs in the dev harness. Same lessons as Clotheskin:
//  - output is read as UTF-8 text in one piece; stdin is closed at once (`files put` gets the body there);
//  - only kin's own "kin: 404" on stderr means "no such file": any other failure must not be read as empty, or the
//    file would be written over;
//  - errors expose a fixed category, never stderr (it can hold private data).
import { execFile } from 'node:child_process';


// kin end takes up to 4,000 characters; the result of read_journal is the longest thing this program says.
const END_LIMIT = 3900;
const NOT_FOUND = /^kin:\s*404\b/im;

/** A fixed category for a failed kin call. */
export function problemOf(err, stderr) {
  if (err && err.code === 'ENOENT') return 'the kin command was not found';
  if (err && err.killed) return 'Kindroid took too long to answer';
  if (err && err.code === 75) return 'Kindroid could not be reached';
  return /\b(5\d\d|429)\b/.test(stderr || '') ? 'Kindroid is busy' : 'Kindroid refused the request';
}

class KinError extends Error {
  constructor(message, missingFile) {
    super(message);
    this.missingFile = missingFile;
  }
}

/** `bin` is `kin` in a run; KIN_BIN=/path/kin.mjs runs the downloadable kin.mjs with node (with KIN_MOCK, nothing is sent). */
export function createKin({ bin = process.env.KIN_BIN || 'kin', timeoutMs = 30000 } = {}) {
  const viaNode = bin.endsWith('.mjs') || bin.endsWith('.js');
  function call(args, input = null) {
    return new Promise((resolve, reject) => {
      const child = execFile(viaNode ? process.execPath : bin, viaNode ? [bin, ...args] : args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        if (!err) { resolve(stdout); return; }
        const missingFile = typeof err.code === 'number' && args[0] === 'files' && args[1] === 'get' && NOT_FOUND.test(stderr);
        reject(new KinError(problemOf(err, stderr), missingFile));
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end(input == null ? undefined : input);
    });
  }
  return {
    /** A file of the program's folder as text, or null when it does not exist yet. Any other failure throws. */
    async get(path) {
      try {
        const body = await call(['files', 'get', path]);
        return body === '' ? null : body;
      } catch (e) {
        if (e instanceof KinError && e.missingFile) return null;
        throw e;
      }
    },
    /** Saves text as a file: `kin files put <path>` with the body on stdin. */
    async put(path, text) {
      await call(['files', 'put', path], String(text));
    },
    /** Ends the run with the one result the Kin and the chat get back. */
    async end(message, { failed = false } = {}) {
      let line = String(message).trim().slice(0, END_LIMIT);
      if (!line) line = failed ? 'Journal could not finish.' : 'Done.';
      if (line.startsWith('-')) line = `Journal: ${line}`; // never read as an option
      await call(['end', ...(failed ? ['--failed'] : []), line]);
    },
  };
}

