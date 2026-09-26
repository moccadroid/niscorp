import { deckGo } from '@lyceum/app/vex/deck.entries';

// Where the deck goes, as a position: one on, one back — clamped to the deck,
// so the first slide has no "back" to fall off and the last no "next" — or
// straight to the slide picked from the list.
const position = { $ref: '$.current.position' };
const last = { $sub: [{ $ref: '$.count.slides' }, 1] };

export const deckNextPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', position: { $min: { over: [{ $add: [position, 1] }, last] } } },
};

export const deckBackPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', position: { $max: { over: [{ $sub: [position, 1] }, 0] } } },
};

export const deckPickPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', position: { $max: { over: [{ $min: { over: [{ $ref: '$.picked' }, last] } }, 0] } } },
};
