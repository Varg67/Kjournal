# Template: Places

Code: `src/core/templates/places.js` · Tests: `tests/places.test.js`

## How the Kin reads a place

When the person's message contains one of the entry's keyphrases, Kindroid puts the entry's text in the Kin's context,
with the photo if there is one ([Kindroid Help Center, Memory](https://kindroid.ai/v2/docs/memory/), Oct 2026). With a
photo, the text becomes a caption of at most 300 characters. So the Kin gets:

- a picture, which already shows colors, furniture, light and layout;
- a short text read **cold**: no form, no labels, no memory of why it was written, possibly months later.

Everything below follows from that.

## Rules against ambiguity

| Rule | Why | Enforced by |
| --- | --- | --- |
| The place is named in the first sentence | Later sentences say "there" and "it"; without the name the photo has no label | composer (sentence order) |
| Names, never I / you / we | "you" in a stored fact can be read as the Kin or as the person | lint `pronoun` |
| The Kin's tie has a tense | "lives there", "lived there until 2019" and "grew up there" are different facts | composer (relation list) |
| Nothing is added that was not given | "goes there often" when nobody said "often" becomes a false memory | composer, test "never invent facts" |
| Absolute time only | "last week" is wrong by the time the entry is recalled | lint `relative_time` |
| Relative places name their anchor | "next door" to what? | lint `relative_place` |
| Facts, not instructions | "Alexi should describe the smell" is behavior; it belongs in the Response Directive | lint `directive` |
| No hedging | "probably" invites the Kin to contradict the entry | lint `hedge` |
| Don't call it "fictional" | The Kin may start calling its own world fictional | lint `fictional` |
| A room names its bigger place | "the attic" alone could be anyone's attic | composer (`partOf` for rooms) |
| With a photo, words go where the photo cannot | Whose it is, what happens there, why it matters, one smell, sound or rule | composer drops `look`; lint `visual` |
| Not a list | Inventories waste the 300 characters and say nothing about meaning | lint `inventory` |
| Global entries stay about the place | Every Kin reads global entries; a tie to one Kin belongs in that Kin's journal | lint `global_tie`, no "your …" suggestions |

## Kinds of place

| Kind | For | Default tie |
| --- | --- | --- |
| Home | house, apartment, cabin, dorm room | lives there |
| Room or spot | part of a bigger place: bedroom, rooftop, booth (needs the bigger place) | uses it |
| Work or school | office, shop, studio, school, campus | works there |
| Hangout | bar, café, restaurant, gym, club | is a regular |
| Public place | park, beach, bridge, square, lighthouse | is a regular |
| Town or city | city, town, village, neighborhood | lives there |
| Outdoors | lake, trail, forest, mountain | is a regular |
| Trip | hotel, resort, a place visited once | has been there |
| Invented world | realm, ship, station, a setting with rules of its own (often global) | none |

Each kind carries prompts for its fields (placeholders on the screen, and guidance for the Kin when it drafts places).

## Fields and the text they make

| Field | Sentence | Kept when space runs out |
| --- | --- | --- |
| name, what, where / partOf | "Joe's Bar is a narrow dive bar on 5th Street, Porto." | always |
| relation (+ since, until, as, often, when, with) | "Alexi goes there every Friday with Rain." | always |
| meaning | "It is where Alexi and Rain first met in 2024." | first |
| detail | "The jukebox only plays 80s rock." | second |
| look | (only without a photo) | third |

Whole sentences are left out when the budget is exceeded, never cut. The composer chooses "on" for streets, coasts,
islands and floors, "in" otherwise, and keeps a preposition or a word like "downtown" when the person wrote one.

Example with a photo (172 of 300 characters):

> Joe's Bar is a narrow dive bar on 5th Street, Porto. Alexi goes there every Friday with Rain. It is where Alexi and
> Rain first met in 2024. The jukebox only plays 80s rock.

## Keyphrases

Suggested: the name (without "the"), the same without apostrophes, the person's aliases, and "your <thing>" for a
place the Kin lives in, owns or works at ("your apartment", "your hometown"). In a one-to-one chat the person says
"your apartment", not "Alexi's apartment", so names that start with the Kin's possessive are not suggested.

Checked: generic places ("home", "the bar"), phrases over four words (they must be typed exactly), apostrophes and
accents (phones type ’ or nothing; people skip accents).

## To test with a real Kin

1. Does matching treat ’ and ' as the same? Accented and plain letters? (Until known, the app suggests both forms.)
2. With a photo, does the Kin connect the caption's first sentence to the picture, and use "there"/"it" correctly?
3. Does the Kin keep the tense of the tie ("lived there until 2019") instead of treating it as current?
4. Does a room entry ("The attic is a reading nook in Alexi's house") get mixed up with other attics in the chat?
5. How do two places with overlapping keyphrases ("your apartment" in an old and a new home) compete for the recall
   slots?
