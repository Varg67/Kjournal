// The Places template: every problem found while designing it is a test here, plus random fields checked against the
// rules that must always hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../src/core/constants.js';
import { validateEntry } from '../src/core/rules.js';
import { countChars } from '../src/core/text.js';
import { PLACE_KINDS, RELATIONS, article, composePlace, lintPlaceKeyphrases, lintPlaceText, located, sentence, suggestPlaceKeyphrases } from '../src/core/templates/places.js';

const kin = { kinName: 'Alexi' };
const text = (fields, photo = true) => composePlace(fields, { ...kin, photo }).text;
const codes = (list) => list.map((x) => x.code);

test('the full shape: what and where, the tie, why it matters, one detail', () => {
  assert.equal(text({ kind: 'hangout', name: "Joe's Bar", what: 'narrow dive bar', where: '5th Street, Porto', relation: 'regular', often: 'every Friday', with: 'Rain', meaning: 'It is where Alexi and Rain first met in 2024.', detail: 'The jukebox only plays 80s rock' }),
    "Joe's Bar is a narrow dive bar on 5th Street, Porto. Alexi goes there every Friday with Rain. It is where Alexi and Rain first met in 2024. The jukebox only plays 80s rock.");
});

test('streets, coasts and islands take "on"; towns take "in"; a written preposition is kept', () => {
  assert.equal(located('5th Street, Porto'), 'on 5th Street, Porto');
  assert.equal(located('the south coast'), 'on the south coast');
  assert.equal(located('Porto'), 'in Porto');
  assert.equal(located('near the old harbour'), 'near the old harbour');
  assert.equal(located('Porto, near Rua Street'), 'in Porto, near Rua Street');
  assert.equal(located('downtown Porto'), 'downtown Porto');
  assert.equal(located("next door to Alexi's apartment"), "next door to Alexi's apartment");
});

test('articles: a/an, and "one-bedroom" is not an article', () => {
  assert.equal(article('apartment'), 'an');
  assert.equal(article('university library'), 'a');
  assert.equal(article('hour-long walk'), 'an');
  assert.equal(text({ kind: 'home', name: 'The blue apartment', what: 'one-bedroom apartment', where: 'Porto' }), 'The blue apartment is a one-bedroom apartment in Porto. Alexi lives there.');
  assert.match(text({ kind: 'home', name: 'Kestrel Hall', what: 'the old family manor', where: 'Kent' }), /^Kestrel Hall is the old family manor in Kent\./);
});

test('ties are grammatical and never invent facts', () => {
  assert.match(text({ kind: 'home', name: 'Flat 4B', what: 'flat', since: '2023' }), /Alexi has lived there since 2023\.$/);
  assert.match(text({ kind: 'hangout', name: 'Café Lume', what: 'café' }), /Alexi is a regular there\.$/);
  assert.doesNotMatch(text({ kind: 'home', name: 'Kestrel Hall', what: 'manor', relation: 'visits' }), /often/);
  assert.match(text({ kind: 'home', name: 'Kestrel Hall', what: 'manor', relation: 'lived', until: '2019' }), /Alexi lived there until 2019\.$/);
  assert.equal(text({ kind: 'invented', name: 'The Drift', what: 'floating market city', relation: 'none' }), 'The Drift is a floating market city.');
});

test('rooms are placed inside their bigger place', () => {
  assert.equal(text({ kind: 'room', name: 'the attic', what: 'reading nook', partOf: "Alexi's house", often: 'on rainy afternoons' }), "The attic is a reading nook in Alexi's house. Alexi uses it on rainy afternoons.");
});

test('with a photo: at most 300 characters, the look is left to the picture, whole sentences only', () => {
  const fields = { kind: 'hangout', name: "Joe's Bar", what: 'narrow dive bar', where: '5th Street, Porto', relation: 'regular', often: 'every Friday', with: 'Rain',
    meaning: 'It is where Alexi and Rain first met in 2024, during the storm that flooded the harbour and closed every other bar in town.', detail: 'The jukebox only plays 80s rock, and Joe never lets anyone touch it or change the old records.', look: 'Red booths.' };
  const r = composePlace(fields, { ...kin, photo: true });
  assert.ok(r.chars <= LIMITS.captionMaxChars);
  assert.deepEqual(r.dropped.sort(), ['detail', 'look']);
  assert.ok(r.text.endsWith('town.'));
  const plain = composePlace(fields, { ...kin, photo: false });
  assert.deepEqual(plain.dropped, []);
  assert.ok(plain.text.endsWith('Red booths.'));
});

test('missing name or Kin, or required parts over budget, is refused', () => {
  assert.equal(composePlace({ kind: 'home', name: '' }, kin).ok, false);
  assert.equal(composePlace({ kind: 'home', name: 'X House' }, {}).ok, false);
  assert.equal(composePlace({ kind: 'home', name: 'X House', what: 'very '.repeat(80) + 'big house' }, { ...kin, photo: true }).ok, false);
});

test('sentences: capitalized, one closing mark, no space before punctuation', () => {
  assert.equal(sentence('  it is   where they met , in 2024  '), 'It is where they met, in 2024.');
  assert.equal(sentence('Was it?'), 'Was it?');
  assert.equal(sentence('ends with a comma,'), 'Ends with a comma.');
  assert.equal(sentence(''), '');
});

test('lint: pronouns, stale time, hedges, instructions, "fictional", owner, lists, colors under a photo', () => {
  const c = (t, opts = {}) => codes(lintPlaceText(t, { ...kin, ...opts }));
  assert.deepEqual(c('You and Alexi go there.'), ['pronoun']);
  assert.ok(c('Alexi went there last week.').includes('relative_time'));
  assert.ok(c('Alexi probably likes it.').includes('hedge'));
  assert.ok(c('Alexi should describe the smell.').includes('directive'));
  assert.ok(c('A fictional bar Alexi likes.').includes('fictional'));
  assert.ok(c('A bar in Porto.').includes('no_owner'));
  assert.ok(c('Alexi keeps a desk, a lamp, a rug, a chair, a sofa, a shelf.').includes('inventory'));
  assert.ok(c('Alexi loves the red booths and the green lamp.', { photo: true }).includes('visual'));
  assert.ok(c('Alexi grew up in Solara.', { scope: 'global' }).includes('global_tie'));
  assert.ok(c('A bakery next door. Alexi buys bread there.').includes('relative_place'));
  assert.ok(!c("A bakery next door to Alexi's apartment. Alexi buys bread there.").includes('relative_place'));
});

test('lint has no false positives on ordinary words', () => {
  for (const t of ['Alexi drives a Mustang there on Wednesdays.', 'Alexi moved to the US in 2019.', 'Alexi\'s friend Ian owns it.', 'Alexi used to live there; it is yours truly-free.'.replace('yours truly-free', 'quiet')]) {
    assert.deepEqual(codes(lintPlaceText(t, kin)), [], t);
  }
});

test('keyphrases: generic places, long phrases, apostrophes and accents, the Kin\'s possessive', () => {
  const c = (list) => codes(lintPlaceKeyphrases(list, kin));
  assert.deepEqual(c(['home']), ['generic_place']);
  assert.deepEqual(c(['the bar']), ['generic_place']);
  assert.deepEqual(c(['the place where we first met']), ['long']);
  assert.deepEqual(c(["joe's bar"]), ['apostrophe']);
  assert.deepEqual(c(['café lume']), ['accent']);
  assert.ok(c(["alexi's apartment"]).includes('third_person'));
  assert.deepEqual(c(['solara', 'your apartment']), []);
});

test('suggested keyphrases: the name, its plain forms, aliases, and "your <thing>"', () => {
  assert.deepEqual(suggestPlaceKeyphrases({ kind: 'hangout', name: "Joe's Bar", what: 'dive bar', aliases: "joe's, the dive" }, kin), ["joe's bar", 'joes bar', "joe's", 'the dive']);
  assert.deepEqual(suggestPlaceKeyphrases({ kind: 'home', name: "Alexi's apartment", what: 'one-bedroom apartment' }, kin), ['your apartment']);
  assert.deepEqual(suggestPlaceKeyphrases({ kind: 'town', name: 'Solara', what: 'seaside town', relation: 'grewUp' }, kin), ['solara', 'your hometown']);
  assert.deepEqual(suggestPlaceKeyphrases({ kind: 'town', name: 'Solara', what: 'seaside town', relation: 'grewUp', scope: 'global' }, kin), ['solara']);
  assert.ok(!suggestPlaceKeyphrases({ kind: 'home', name: 'The house', what: 'house' }, kin).includes('house'));
});

// Random fields, many times: what must always hold.
function rng(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const WORDS = ['old', 'quiet', 'harbour', 'Porto', 'Rain', 'Friday', 'café', 'jukebox', 'smoke', 'garden', 'São Paulo', 'rooftop', '2024', 'cold', 'neon', 'Marta'];

test('fuzz: always within the limit, whole sentences, the name first, the Kin named, and a valid entry', () => {
  const rand = rng(20261124);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const phrase = (max) => Array.from({ length: Math.floor(rand() * max) }, () => pick(WORDS)).join(' ');
  let checked = 0;
  for (let i = 0; i < 3000; i++) {
    const kind = pick(PLACE_KINDS);
    const photo = rand() < 0.5;
    const fields = {
      kind: kind.id, name: phrase(4) || 'Place', what: phrase(5), where: rand() < 0.7 ? phrase(4) : '', partOf: phrase(3),
      relation: pick(kind.relations.concat(['bogus'])), since: rand() < 0.3 ? '2023' : '', until: rand() < 0.2 ? '2019' : '', as: phrase(2), often: phrase(3),
      with: rand() < 0.3 ? 'Rain' : '', meaning: phrase(30), detail: phrase(20), look: phrase(20),
    };
    const r = composePlace(fields, { ...kin, photo });
    if (!r.ok) { assert.ok(r.chars > r.limit, `refused without being over: ${JSON.stringify(fields)}`); continue; }
    checked += 1;
    assert.ok(r.chars <= (photo ? LIMITS.captionMaxChars : LIMITS.contentMaxChars));
    assert.equal(countChars(r.text), r.chars);
    assert.ok(r.text.startsWith(fields.name.charAt(0).toUpperCase()), r.text);
    assert.doesNotMatch(r.text, /\s\s|\.\.(?!\.)|\s[.,]|\{K\}|undefined|null/);
    assert.match(r.text, /[.!?…]$/);
    if (fields.relation !== 'none' && !(fields.relation === 'bogus' && kind.relations[0] === 'none')) assert.ok(r.text.includes('Alexi'), r.text);
    if (photo) assert.ok(!r.used.includes('look'));
    const entry = { title: fields.name, scope: 'kin', kinId: 'k', content: r.text, keyphrases: ['some phrase'], photo };
    const errors = validateEntry(entry).issues.filter((x) => x.severity === 'error').map((x) => x.code);
    assert.deepEqual(errors.filter((code) => code !== 'content_too_short'), [], r.text);
  }
  assert.ok(checked > 2000, `only ${checked} cases composed`);
});

test('every kind offers ties that exist, and its examples compose cleanly', () => {
  for (const kind of PLACE_KINDS) {
    for (const r of kind.relations) assert.ok(RELATIONS[r], `${kind.id}: ${r}`);
    const p = kind.prompts;
    const r = composePlace({ kind: kind.id, name: 'Example', what: p.what.split(',')[0], where: p.where && p.where.split(',')[0], partOf: p.partOf && p.partOf.split(',')[0] }, { ...kin, photo: true });
    assert.ok(r.ok, kind.id);
    assert.deepEqual(codes(lintPlaceText(r.text, { ...kin, photo: true, scope: kind.relations[0] === 'none' ? 'global' : 'kin' })), [], r.text);
  }
});
