// Writes sample/journal.json: fictional entries for the App Library card's picture (taken from sample/ with no
// Kindroid around, so Kin names come from kinNames). node scripts/build-sample.mjs [--check]
import { emptyJournal, serializeJournal } from '../src/core/document.js';
import { isMainModule, writeOrCheck } from './lib/generated.mjs';

const at = (day, hour = 18) => `2026-11-${day}T${hour}:00:00.000Z`;
const e = (id, title, kinId, content, keyphrases, status, day, more = {}) => ({ id, title, scope: kinId ? 'kin' : 'global', kinId, content, keyphrases, tags: more.tags || [], status, createdAt: at(day), updatedAt: at(day), ...(more.extra || {}) });

export function sample() {
  return serializeJournal({
    ...emptyJournal(at(24)),
    kinNames: { 'sample-alexi': 'Alexi', 'sample-quinn': 'Quinn' },
    entries: [
      e('sample-4', 'Quinn\'s first exhibition', 'sample-quinn', 'Quinn showed photographs for the first time in a small gallery downtown. Two sold, and she keeps the invitation in her wallet.', ['the exhibition', 'gallery downtown'], 'draft', '24', { extra: { author: 'kin' } }),
      e('sample-2', 'Marta, the older sister', 'sample-alexi', 'Marta is Alexi\'s older sister. She lives in Lisbon, calls every Sunday and still uses Alexi\'s childhood nickname.', ['Marta', 'my sister', 'Sunday call'], 'ready', '23', { tags: ['family'] }),
      e('sample-1', 'The night at the cabin', 'sample-alexi', 'Rain and Alexi spent a night at a mountain cabin. They played cards by the fireplace and shared a bottle of Quantum Tequila nobody remembers buying.', ['night at the cabin', 'by the fireplace', 'quantum tequila'], 'inKindroid', '22', { tags: ['memories'], extra: { markedInKindroidAt: at(22, 19) } }),
      e('sample-3', 'The Solara lighthouse', null, 'Solara is a fictional seaside town of white houses. Its old lighthouse still works, and the harbour market opens before sunrise.', ['Solara', 'Solara lighthouse'], 'outdated', '21', { tags: ['world'] }),
    ],
  });
}

if (isMainModule(import.meta.url)) writeOrCheck('sample/journal.json', sample());
