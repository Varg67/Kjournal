// Shared constants. APP_VERSION equals "version" in package.json; bump both together on a release.
export const APP_VERSION = '1.0.0';

// The program's folder. One writer per file: the screen writes JOURNAL_FILE, the run writes DRAFTS_FILE.
export const JOURNAL_FILE = 'journal.json';
export const DRAFTS_FILE = 'kin-drafts.json';
export const EXPORT_FILES = { kjournal: 'exports/journal.kjournal', markdown: 'exports/journal.md' };

// Kindroid's Journal Entry limits (V8 and later).
export const LIMITS = {
  keyphraseMinCount: 1,
  keyphraseMaxCount: 8,
  keyphraseMinChars: 2,
  keyphraseMaxChars: 50,
  entriesPerType: 500,
  recalledPerMessagePerType: 3,
  contentComfortChars: 1000, // guidance only: every recalled entry takes chat context
  titleMaxChars: 120,
};

export const STATUSES = ['draft', 'ready', 'inKindroid', 'outdated'];
