import { deckGo } from '@lyceum/app/vex/deck.entries';

// Next and back, as positions: one on or one back from the slide on screen,
// clamped to the deck — so the first slide has no "back" to fall off and the
// last has no "next".
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
