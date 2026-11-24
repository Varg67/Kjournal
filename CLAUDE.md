# Journal: rules for any Claude session

Journal is a Kindroid Workshop program, built and installed like Clotheskin (`Varg67/Clotheskin`). Read this before
changing anything.

## Installing in Kindroid: only one way

The Workshop agent opens each file from GitHub's raw address **pinned to a commit**, step by step in the same chat.
`COMO-INSTALAR.md` has the messages; `npm run install-prompt` prints them with the pushed commit filled in. The file
list is computed from the imports. Always send all of them together. No `kin send`, no keys, no tarballs.

## Before delivering

```bash
npm run build        # regenerates the generated files
npm test             # unit tests, generated files up to date, sizes
npm start & npm run test:e2e   # the screen in Chromium
```

## Invariants

- **Generated files are never edited by hand:** `screen/core.js`, `screen/app.js`, `sample/journal.json`,
  `COMO-INSTALAR.md`. Change `src/` or `scripts/` and run `npm run build`.
- **No network, no grants, no API.** Never add calls to Kindroid's API (the old v1 `journal-create` was removed on
  purpose) or to anything else.
- No dependencies in `package.json`: Kindroid installs the root lockfile at every run.
- `run/program.js` and `src/core/` never import from Node. `src/screen/` follows the bundler's rules: named imports
  and exports only, nothing newer than Safari 14.1 (no `<dialog>`, `.at()`, `structuredClone`, `crypto.randomUUID`,
  CSS `:has()`), no browser storage, saved data only as text.
- Each screen script stays under 60,000 characters (a test checks it) so the agent copies it whole.
- One writer per file: the screen writes `journal.json`; the run writes `kin-drafts.json`.
- Journal Entry rules live only in `src/core/rules.js` and `src/core/constants.js`.
- Version: `APP_VERSION` in `src/core/constants.js` equals `version` in `package.json`; bump both together.
- Language: code, comments, the screen and `README.md` in English; documents for the user (`COMO-INSTALAR.md`,
  `docs/`) in Portuguese; prompts to the Kin and to the Workshop agent in English.
