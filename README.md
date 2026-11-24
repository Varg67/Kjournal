# Journal

A Kindroid app for your Kins' **Journal Entries**. Write them, organize them by Kin, check them against Kindroid's
rules, test which keyphrases would fire, and only then add them in Kindroid. Your Kin can also draft entries during
a chat ("write that down in your journal"); they show up on the screen for you to review.

It is a Kindroid Workshop program, installed the same way as Clotheskin (see `COMO-INSTALAR.md`). It asks for
**no grants**: no chat reading, no network, no Kindroid API. It only uses its own folder.

The successor of *Kindroid Journal Manager* 1.x, which published through the old v1 API (`/v1/journal-create`) from a
local Node server. That is gone: nothing here calls any API.

## What it does

**The screen** (`screen/`, panel "Journal")
- Individual entries (per Kin attached to the app) and global ones.
- Kindroid's current rules: 1–8 keyphrases of 2–50 characters, up to 500 entries per type, up to 3 recalled per
  message per type. Warnings for common-word keyphrases, keyphrases shared or overlapping between entries that
  compete (same Kin, or global), and long entries.
- **Test triggers**: type a message as in chat and see which entries would be recalled.
- Status: Draft, Ready, In Kindroid (set by you after pasting it there); **Outdated** by itself when you edit
  something that was already in Kindroid.
- Copy text / keyphrases for pasting into Kindroid. When the frame blocks the clipboard, the text is shown selected.
- **Import** by pasting (or a file): KJOURNAL v1/v2, a backup of this app, and backups of the 1.x and 2.0 versions
  (the old `ai_id` is dropped; Kins are matched by name).
- **Export**: KJOURNAL, a Markdown checklist, JSON, or a full backup. Copy it, or save it as the file behind the
  app's **link** (Kindroid → the app's settings → links).

**The Kin's actions** (the Kin decides when, from the description)
- `save_journal_entry`: saves a **draft**. Nothing reaches the Kin's real Journal in Kindroid until you review it
  and add it there.
- `read_journal`: the entries of that Kin, and the global ones, that match a query.

## How it works in Kindroid

```
 Kin uses an action ──> node main.js ──> run/program.js ──> kin files get / put
                                               │
                                               └──> kin-drafts.json   (only the run writes)
 screen ──> journal.json (only the screen writes) <── screen also reads kin-drafts.json
```

- **One writer per file.** The screen writes `journal.json` (the library); the run writes `kin-drafts.json` (the
  Kin's drafts the screen has not taken in yet) and only reads `journal.json`. They never overwrite each other.
- **Several screens** (phone and computer) are reconciled when saving: the newest edit of each entry wins, and
  deletions are kept as dated tombstones (120 days) so an old copy cannot bring an entry back.
- **Nothing lost.** A file that exists but cannot be read is never written over (only kin's own "404" means "no
  file yet"). A failed save shows "Not saved" and is retried on the next change.
- **The screen** re-reads both files every 20 seconds and when it comes back into view. It keeps nothing in the
  browser.
- **Credits.** No schedule: the run starts only when the Kin uses an action, for a few seconds.

### Files in the program's folder

| File | Written by | Holds |
| --- | --- | --- |
| `journal.json` | the screen | the library: entries, tombstones, the last known names of Kins |
| `kin-drafts.json` | the run | the Kin's drafts not yet taken in (at most 200) |
| `exports/journal.kjournal`, `exports/journal.md` | the screen, when you ask | the files behind the app's links |

## Develop

Requires Node 22+. No dependencies.

```bash
npm start            # the dev harness: http://localhost:5173/dev/
npm test             # unit tests (node --test)
npm run test:e2e     # the screen in Chromium, through the harness (needs npm start and Playwright)
npm run build        # regenerates screen/core.js, screen/app.js, sample/journal.json, COMO-INSTALAR.md
npm run try          # main.js with Kindroid's own kin.mjs in mock mode (download kin.mjs first)
npm run install-prompt   # the Workshop messages for the pushed commit
```

**The dev harness** (`dev/`) shows the real screen in a 390-point sandboxed frame, answers its messages as the guide
describes, runs the real `run/program.js` for the Kin's actions, and can attach or detach Kins and make writes fail.

### Layout

| Path | What |
| --- | --- |
| `kin.json` | the manifest: run, screen, the two actions, links; no grants |
| `main.js` | the run's entry: stdin → program → exactly one `kin end` |
| `run/kin.js` | the `kin` command as functions (404 told apart from failures, fixed error categories) |
| `run/program.js` | the two actions; no Node imports |
| `src/core/` | shared logic: rules, collisions, triggers, entries, `journal.json`, KJOURNAL, import, library views |
| `src/screen/` | the screen's sources: channel, store (state and saving), views |
| `screen/` | what Kindroid serves: `index.html`, `core.js` and `app.js` (**generated** classic scripts, Safari 14.1), CSS, icon |
| `sample/` | fictional data for the App Library card's picture (generated) |
| `dev/`, `server.mjs` | the dev harness |
| `tests/` | unit tests, `run-main.test.js` (the real `node main.js` with a stand-in `kin`), `e2e/screen.cjs` |
| `scripts/` | generators and `try-run.mjs` |
| `docs/` | the KJOURNAL format and the project's history, in Portuguese |
| `examples/` | KJOURNAL examples (fictional) |
