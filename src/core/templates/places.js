// The Places template: a place the Kin knows, written so the Kin reads it one way only.
//
// How Kindroid uses it: when the person's message contains a keyphrase, the entry's text is put in the Kin's context,
// with the photo when there is one. With a photo the text is a caption of at most 300 characters. The Kin reads the
// caption cold, without the form it came from, so every sentence must stand on its own:
//   - names, never I/you/we: "you" in a stored fact could be the Kin or the person;
//   - the place is named in the first sentence, and every later sentence leans on it ("there", "it");
//   - the Kin's tie to the place has a tense: lives / lived / grew up / goes every Friday;
//   - absolute anchors, never "recently" or "last week": the entry is read months later;
//   - with a photo, words go to what the picture cannot show: whose it is, what happens there, why it matters,
//     one sound, smell or house rule. Colours and furniture are already in the photo.
// The composer builds the text from fields in that order and fits it to the budget by leaving out whole optional
// sentences, never cutting one.
import { LIMITS } from '../constants.js';
import { comparisonForm, countChars, normalizeKeyphrase } from '../text.js';

/**
 * Kinds of place. `relations`: the ties offered (the first is the default). `prompts`: what each field asks for, for
 * this kind (shown as placeholders, and given to the Kin when it drafts places).
 */
export const PLACE_KINDS = [
  { id: 'home', label: 'Home', hint: 'Where someone lives: house, apartment, cabin, dorm room.', relations: ['lives', 'lived', 'grewUp', 'owns', 'visits'],
    prompts: { what: 'one-bedroom apartment, farmhouse', where: 'Porto, a quiet street in Alfama', meaning: 'who else lives there, what life there is like', detail: 'a smell, a sound, a house rule' } },
  { id: 'room', label: 'Room or spot', hint: 'Part of a bigger place: a bedroom, the rooftop, the garden, a booth.', relations: ['uses', 'owns', 'regular'], needsPartOf: true,
    prompts: { what: 'reading nook, workshop, corner booth', partOf: "Alexi's house, Joe's Bar", meaning: 'what the Kin does there', detail: 'one object that matters there' } },
  { id: 'work', label: 'Work or school', hint: 'Office, shop, studio, school, campus.', relations: ['works', 'studies', 'owns', 'worked', 'studied'],
    prompts: { what: 'tattoo studio, law firm, art school', where: 'downtown Porto', meaning: 'the people there, what the work is like', detail: 'a routine, a uniform, a rule' } },
  { id: 'hangout', label: 'Hangout', hint: 'Bar, café, restaurant, gym, club: somewhere the Kin goes back to.', relations: ['regular', 'owns', 'works'],
    prompts: { what: 'dive bar, rooftop café, boxing gym', where: '5th Street, Porto', meaning: 'what happened there, who the Kin meets there', detail: 'the usual order, a sound, a house rule' } },
  { id: 'public', label: 'Public place', hint: 'Park, beach, bridge, square, lighthouse.', relations: ['regular', 'visited', 'none'],
    prompts: { what: 'pier, botanical garden, old lighthouse', where: 'the harbour of Solara', meaning: 'what the Kin does or did there', detail: 'the best time to go, a sound' } },
  { id: 'town', label: 'Town or city', hint: 'City, town, village, neighborhood.', relations: ['lives', 'grewUp', 'lived', 'visited', 'wants'],
    prompts: { what: 'seaside town, mining village, neighborhood', where: 'the south coast, northern Portugal', meaning: 'what the Kin thinks of it, who is still there', detail: 'what it is known for' } },
  { id: 'outdoors', label: 'Outdoors', hint: 'Lake, trail, forest, mountain, coast.', relations: ['regular', 'visited', 'wants', 'none'],
    prompts: { what: 'mountain lake, coastal trail', where: 'an hour north of Porto', meaning: 'what the Kin does there, with whom', detail: 'the season, the light, a sound' } },
  { id: 'trip', label: 'Trip', hint: 'A hotel, resort or place visited on a trip.', relations: ['visited', 'wants'],
    prompts: { what: 'beach hotel, ski lodge', where: 'Madeira', meaning: 'what happened on that trip', detail: 'one moment the Kin remembers' } },
  { id: 'invented', label: 'Invented world', hint: 'A realm, ship, station or setting with rules of its own (often a global entry).', relations: ['none', 'lives', 'visited'],
    prompts: { what: 'floating market city, orbital station', where: 'the Shattered Sea', meaning: 'how it works, who rules it', detail: 'one rule of that world' } },
];

/**
 * The Kin's tie to the place, as a sentence. {K}: the Kin's name. Options: since, until, as, often, when.
 * A tie never adds a fact that was not given: no "often" unless the person said how often.
 */
export const RELATIONS = {
  lives: { label: 'lives there', sentence: (o) => (o.since ? `{K} has lived there since ${o.since}` : '{K} lives there') },
  lived: { label: 'used to live there', sentence: (o) => (o.until ? `{K} lived there until ${o.until}` : '{K} used to live there') },
  grewUp: { label: 'grew up there', sentence: () => '{K} grew up there' },
  owns: { label: 'owns it', sentence: () => '{K} owns it' },
  visits: { label: 'visits', sentence: (o) => `{K} visits${o.often ? ` ${o.often}` : ' it'}` },
  uses: { label: 'uses it', sentence: (o) => `{K} uses it${o.often ? ` ${o.often}` : ''}` },
  works: { label: 'works there', sentence: (o) => `{K} works there${o.as ? ` as ${o.as}` : ''}` },
  worked: { label: 'used to work there', sentence: (o) => `{K} worked there${o.as ? ` as ${o.as}` : ''}${o.until ? ` until ${o.until}` : ''}` },
  studies: { label: 'studies there', sentence: () => '{K} studies there' },
  studied: { label: 'studied there', sentence: (o) => `{K} studied there${o.until ? ` until ${o.until}` : ''}` },
  regular: { label: 'is a regular', sentence: (o) => (o.often ? `{K} goes there ${o.often}` : '{K} is a regular there') },
  visited: { label: 'has been there', sentence: (o) => (o.when ? `{K} visited it ${o.when}` : '{K} has been there') },
  wants: { label: 'wants to go', sentence: () => '{K} wants to go there someday' },
  none: { label: 'no tie (setting only)', sentence: () => '' },
};

const PREPOSITION = /^(in|on|at|near|by|inside|outside|above|below|behind|beside|next to|off|under|along|across|between|among|within|over|of|from|around|beyond)\b/i;
// An article or determiner is a whole word followed by a space: "one-bedroom" does not start with one.
const ARTICLE = /^(a|an|the|one|some|two|three|his|her|their|its|this|that)\s/i;
// Places that take "on": streets, coasts, islands, floors. Everything else takes "in".
const ON_PLACES = /\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|drive|way|coast|shore|island|isle|floor|corner|campus|outskirts|edge|banks?)\b/i;

/** "an" or "a" for a noun phrase (a few common exceptions; a wrong guess is easy to fix by writing the article). */
export function article(phrase) {
  const w = phrase.trim().toLowerCase();
  if (/^(hour|honest|heir|honou?r)/.test(w)) return 'an';
  if (/^(uni|use|usu|eu|one|once|ufo)/.test(w)) return 'a';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** A sentence: trimmed, capitalized, one closing mark. Empty stays empty. */
export function sentence(text) {
  let s = clean(text).replace(/\s+([,.;:!?])/g, '$1');
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?…]["')\]]?$/.test(s) ? s : `${s.replace(/[,;:]+$/, '')}.`;
}

// Words that already say where, without a preposition: "downtown", "upstairs", "next door".
const ADVERBIAL = /^(downtown|uptown|upstairs|downstairs|nearby|next door|abroad|overseas|offshore|underground|across the street|down the street|around the corner)\b/i;

/** "in Porto" stays; "Porto" becomes "in Porto"; "5th Street" becomes "on 5th Street" (the first part decides). */
export function located(where) {
  const w = clean(where);
  if (!w) return '';
  if (PREPOSITION.test(w) || ADVERBIAL.test(w)) return w;
  return `${ON_PLACES.test(w.split(',')[0]) ? 'on' : 'in'} ${w}`;
}

/**
 * The text from the fields. fields: { kind, name, what, where, partOf, relation, since, until, as, often, when,
 * with, meaning, detail, look, custom }. ctx: { kinName, photo }.
 * Returns { ok, text, chars, limit, used, dropped, error? }.
 */
export function composePlace(fields, { kinName = '', photo = false } = {}) {
  const kind = PLACE_KINDS.find((k) => k.id === fields.kind) || PLACE_KINDS[0];
  const limit = photo ? LIMITS.captionMaxChars : LIMITS.contentMaxChars;
  const kin = clean(kinName);
  const name = clean(fields.name);
  if (!name) return { ok: false, error: 'The place needs a name or a short description.', text: '', chars: 0, limit, used: [], dropped: [] };
  if (!kin) return { ok: false, error: 'The Kin\'s name is needed, so the entry says whose place it is.', text: '', chars: 0, limit, used: [], dropped: [] };

  // 1. What and where. "Joe's Bar is a dive bar on 5th Street." / "The attic is a room in Alexi's house."
  const what = clean(fields.what) || kind.label.toLowerCase();
  const where = kind.needsPartOf ? located(fields.partOf) || located(fields.where) : located(fields.where);
  const whatPhrase = ARTICLE.test(what) ? what : `${article(what)} ${what}`;
  const identity = sentence(`${name} is ${whatPhrase}${where ? ` ${where}` : ''}`);

  // 2. The Kin's tie, with whom. "Alexi goes there every Friday with Rain."
  const relation = RELATIONS[fields.relation] ? fields.relation : kind.relations[0];
  const companions = clean(fields.with);
  let tie = clean(fields.custom) || RELATIONS[relation].sentence({ since: clean(fields.since), until: clean(fields.until), as: clean(fields.as), often: clean(fields.often), when: clean(fields.when) });
  if (tie && companions && !clean(fields.custom)) tie += ` with ${companions}`;
  tie = sentence(tie.replace(/\{K\}/g, kin));

  // 3-5, optional, in the order they are kept when space runs out.
  const optional = [
    ['meaning', sentence(fields.meaning)],
    ['detail', sentence(fields.detail)],
    ['look', photo ? '' : sentence(fields.look)], // with a photo, the picture shows it
  ];
  const required = [identity, tie].filter(Boolean);
  const join = (parts) => parts.join(' ');
  if (countChars(join(required)) > limit) {
    return { ok: false, error: `The name, description and tie alone are over ${limit} characters: shorten them.`, text: join(required), chars: countChars(join(required)), limit, used: ['identity', 'tie'], dropped: [] };
  }
  const parts = required.slice();
  const used = ['identity'].concat(tie ? ['tie'] : []);
  const dropped = [];
  for (const [key, text] of optional) {
    if (!text) continue;
    if (countChars(join(parts.concat([text]))) <= limit) { parts.push(text); used.push(key); } else dropped.push(key);
  }
  if (photo && sentence(fields.look)) dropped.push('look');
  const text = join(parts);
  return { ok: true, text, chars: countChars(text), limit, used, dropped };
}

// ---------------------------------------------------------------------------------------------------------------
// Checks for ambiguity. Warnings, never errors: the person may know better.

const words = (re) => new RegExp(`\\b(${re})\\b`, 'gi');
const PRONOUNS = words('i|me|my|mine|myself|we|us|our|ours|ourselves|you|your|yours|yourself|yourselves');
const RELATIVE_TIME = words('yesterday|today|tonight|tomorrow|recently|lately|nowadays|these days|currently|right now|last (?:night|week|month|year|summer|winter)|next (?:week|month|year)|ago|soon');
const HEDGES = words('maybe|perhaps|probably|possibly|might|kind of|sort of|somewhat|i think|i guess');
const DIRECTIVES = words('should|must|remember to|make sure|pretend|roleplay|role-play|ooc|always describe|never mention');
const COLORS = words('red|blue|green|yellow|white|black|grey|gray|brown|pink|purple|orange|beige|golden');

/** Ambiguity checks on a place's text: [{ code, message, match }]. ctx: { kinName, photo, scope } */
export function lintPlaceText(text, { kinName = '', photo = false, scope = 'kin' } = {}) {
  const out = [];
  const add = (code, message, match) => out.push({ code, message, ...(match ? { match } : {}) });
  const pronouns = [...text.matchAll(PRONOUNS)].map((m) => m[0]).filter((w) => w !== 'US'); // "the US" is a country
  if (pronouns.length) add('pronoun', `"${pronouns[0]}" is ambiguous in a journal entry: the Kin may read it as itself or as the person. Use names.`, pronouns[0]);
  const rel = text.match(RELATIVE_TIME);
  if (rel) add('relative_time', `"${rel[0]}" goes stale: the entry is read months later. Use a date or leave time out.`, rel[0]);
  const hedge = text.match(HEDGES);
  if (hedge) add('hedge', `"${hedge[0]}" makes the fact uncertain, and the Kin may contradict it. State it plainly.`, hedge[0]);
  const directive = text.match(DIRECTIVES);
  if (directive) add('directive', `"${directive[0]}" is an instruction, not a fact. Behavior rules belong in the Response Directive.`, directive[0]);
  const near = text.match(/\b(next door|nearby|around the corner|down the street|across the street|upstairs|downstairs)\b(?!\s+(?:to|from|of)\b)/i);
  if (near) add('relative_place', `"${near[0]}" from what? Name the place it is relative to ("next door to Alexi's apartment").`, near[0]);
  if (/\bfictional\b/i.test(text)) add('fictional', '"fictional" can make the Kin call its own world fictional. Describe the place as real to the Kin.');
  if (scope === 'kin' && kinName && !comparisonForm(text).includes(comparisonForm(kinName))) add('no_owner', `The text never names ${kinName}: whose place it is stays unclear.`);
  if (scope === 'global' && kinName && comparisonForm(text).includes(comparisonForm(kinName))) add('global_tie', `Every Kin reads global entries. A tie to ${kinName} belongs in ${kinName}'s own journal; keep the global entry about the place.`);
  if ((text.match(/,/g) || []).length >= 5) add('inventory', 'It reads like a list. Keep the one or two details that tell this place apart.');
  if (photo && (text.match(COLORS) || []).length >= 2) add('visual', 'The photo already shows colors and looks. Spend the caption on what it cannot show.');
  return out;
}

const GENERIC_PLACE = new Set(['home', 'house', 'room', 'bedroom', 'kitchen', 'bathroom', 'living room', 'bar', 'cafe', 'café', 'office', 'work', 'school', 'city', 'town', 'park', 'beach', 'street', 'car', 'outside', 'inside', 'there', 'here', 'place', 'my place', 'your place', 'the house', 'the bar', 'downtown']);

/** Checks on a place's keyphrases: [{ code, message, keyphrase }]. */
export function lintPlaceKeyphrases(keyphrases, { kinName = '' } = {}) {
  const out = [];
  for (const raw of keyphrases) {
    const k = normalizeKeyphrase(raw);
    const c = comparisonForm(k);
    if (GENERIC_PLACE.has(c) || GENERIC_PLACE.has(c.replace(/^the /, ''))) out.push({ code: 'generic_place', keyphrase: k, message: `"${k}" comes up in many chats about other places. Use the place's name or "your <name>".` });
    if (k.split(' ').length > 4) out.push({ code: 'long', keyphrase: k, message: `"${k}" must be typed exactly as written to match. Shorter is safer.` });
    if (/['’]/.test(k)) out.push({ code: 'apostrophe', keyphrase: k, message: `Phones often type ’ instead of ' (or no apostrophe at all). Add "${k.replace(/['’]/g, '')}" as well, until Kindroid's matching is confirmed.` });
    if (/[^\u0000-\u007f]/.test(k.replace(/’/g, ''))) out.push({ code: 'accent', keyphrase: k, message: `"${k}" has accents; people often type without them. Consider "${k.normalize('NFD').replace(/[̀-ͯ]/g, '')}" too.` });
    if (kinName && c.includes(`${comparisonForm(kinName)}'s`)) out.push({ code: 'third_person', keyphrase: k, message: `In a one-to-one chat people say "your …", not "${kinName}'s …". Add the "your" form.` });
  }
  return out;
}

/**
 * Keyphrases worth starting from: the name, its form without "the" and apostrophes, aliases, and "your <thing>" for a
 * place the Kin lives in, owns or works at. A name that starts with the Kin's possessive ("Alexi's apartment") is not
 * offered: in a one-to-one chat the person says "your apartment".
 */
export function suggestPlaceKeyphrases(fields, { kinName = '' } = {}) {
  const kin = clean(kinName).toLowerCase();
  const kinPossessive = kin ? { test: (s) => s.startsWith(`${kin}'s `) || s.startsWith(`${kin}’s `) || s === `${kin}'s` || s === `${kin}’s` } : null;
  const name = clean(fields.name).toLowerCase();
  const out = [];
  const push = (k) => {
    const n = normalizeKeyphrase(k);
    if (n && countChars(n) >= LIMITS.keyphraseMinChars && countChars(n) <= LIMITS.keyphraseMaxChars && !out.some((o) => comparisonForm(o) === comparisonForm(n))) out.push(n);
  };
  const bare = name.replace(/^the /, '');
  if (!(kinPossessive && kinPossessive.test(bare))) {
    push(bare);
    if (/['’]/.test(bare)) push(bare.replace(/['’]/g, ''));
  }
  for (const alias of clean(fields.aliases).split(',')) push(alias.toLowerCase());
  const noun = clean(fields.what).toLowerCase().split(' ').pop();
  const kind = fields.kind;
  if (noun && fields.scope !== 'global' && ['lives', 'owns', 'works', 'grewUp', 'studies'].includes(fields.relation || (PLACE_KINDS.find((k) => k.id === kind) || PLACE_KINDS[0]).relations[0])) {
    push(fields.relation === 'grewUp' ? (kind === 'town' ? 'your hometown' : `your childhood ${noun}`) : `your ${noun}`);
  }
  return out.filter((k) => !GENERIC_PLACE.has(comparisonForm(k))).slice(0, LIMITS.keyphraseMaxCount);
}
