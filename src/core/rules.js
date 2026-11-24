// Journal Entry rules: the only place they live. The editor, the importer and the Kin's action all use these.
import { LIMITS } from './constants.js';
import { comparisonForm, countChars, normalizeKeyphrase } from './text.js';

// Words that fire on almost any message: a keyphrase made only of one of these is recalled in the wrong places.
const GENERIC = new Set([
  'eu', 'você', 'voce', 'ele', 'ela', 'nós', 'nos', 'eles', 'elas', 'sim', 'não', 'nao', 'oi', 'olá', 'ola', 'casa',
  'dia', 'hoje', 'amor', 'bem', 'mal', 'muito', 'pouco', 'aqui', 'ali', 'isso', 'isto', 'que', 'como', 'quando', 'onde',
  'por', 'para', 'com', 'sem', 'uma', 'um', 'de', 'do', 'da', 'em', 'mas', 'noite', 'tarde',
  'i', 'you', 'he', 'she', 'we', 'they', 'it', 'yes', 'no', 'hi', 'hello', 'home', 'day', 'today', 'love', 'good',
  'bad', 'the', 'and', 'but', 'with', 'what', 'when', 'where', 'how', 'this', 'that', 'there', 'here', 'night', 'time',
  'me', 'my', 'your',
]);

export const isGenericKeyphrase = (keyphrase) => GENERIC.has(comparisonForm(keyphrase));

/** The most text Kindroid keeps for this entry: a caption with a photo, the full text without. */
export const contentLimit = (entry) => (entry.photo ? LIMITS.captionMaxChars : LIMITS.contentMaxChars);

/**
 * Issues of one entry: { severity: 'error'|'warning', field, code, message, index? }. Errors block "ready" and
 * "in Kindroid"; warnings never block. Cross-entry checks are in collisions.js.
 */
export function validateEntry(entry) {
  const issues = [];
  const add = (severity, field, code, message, index) => issues.push({ severity, field, code, message, ...(index === undefined ? {} : { index }) });
  const chars = countChars(entry.content.trim());

  if (!entry.title.trim()) add('warning', 'title', 'title_missing', 'No title yet: give it a name so you can find it later.');
  else if (countChars(entry.title.trim()) > LIMITS.titleMaxChars) add('warning', 'title', 'title_long', `The title is over ${LIMITS.titleMaxChars} characters.`);

  if (entry.photo) {
    if (chars > LIMITS.captionMaxChars) add('error', 'content', 'caption_too_long', `With a photo, Kindroid keeps a caption of at most ${LIMITS.captionMaxChars} characters.`);
  } else if (chars === 0) add('error', 'content', 'content_empty', 'The entry has no text.');
  else if (chars < LIMITS.contentMinChars) add('error', 'content', 'content_too_short', `Kindroid needs at least ${LIMITS.contentMinChars} characters of text.`);
  else if (chars > LIMITS.contentMaxChars) add('error', 'content', 'content_too_long', `Kindroid keeps at most ${LIMITS.contentMaxChars} characters of text.`);

  if (entry.scope === 'kin' && !entry.kinId) add('warning', 'kin', 'kin_missing', 'This entry is not assigned to a Kin.');

  if (entry.keyphrases.filter((k) => k.trim()).length < LIMITS.keyphraseMinCount) {
    add('error', 'keyphrases', 'keyphrase_none', 'Add at least one keyphrase: without one the entry is never recalled.');
  }
  if (entry.keyphrases.length > LIMITS.keyphraseMaxCount) {
    add('error', 'keyphrases', 'keyphrase_too_many', `Kindroid takes at most ${LIMITS.keyphraseMaxCount} keyphrases per entry.`);
  }
  const seen = new Map();
  entry.keyphrases.forEach((raw, i) => {
    const phrase = normalizeKeyphrase(raw);
    const label = `Keyphrase ${i + 1}`;
    if (!phrase) { add('error', 'keyphrases', 'keyphrase_empty', `${label} is empty.`, i); return; }
    const length = countChars(phrase);
    if (length < LIMITS.keyphraseMinChars) add('error', 'keyphrases', 'keyphrase_too_short', `${label} needs at least ${LIMITS.keyphraseMinChars} characters.`, i);
    else if (length > LIMITS.keyphraseMaxChars) add('error', 'keyphrases', 'keyphrase_too_long', `${label} is over ${LIMITS.keyphraseMaxChars} characters.`, i);
    const key = comparisonForm(phrase);
    if (seen.has(key)) add('error', 'keyphrases', 'keyphrase_duplicate', `${label} repeats keyphrase ${seen.get(key) + 1}.`, i);
    else seen.set(key, i);
    if (isGenericKeyphrase(phrase)) add('warning', 'keyphrases', 'keyphrase_generic', `"${phrase}" is too common and will fire in unrelated chats.`, i);
  });

  return { valid: !issues.some((x) => x.severity === 'error'), issues, chars };
}

/** Keyphrases as stored: normalized, no empties, no case-insensitive repeats. */
export function cleanKeyphrases(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const phrase = normalizeKeyphrase(raw);
    const key = comparisonForm(phrase);
    if (phrase && !seen.has(key)) { seen.add(key); out.push(phrase); }
  }
  return out;
}
