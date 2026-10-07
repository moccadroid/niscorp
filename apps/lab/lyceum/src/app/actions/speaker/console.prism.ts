import { deckGo } from '@lyceum/app/vex/deck.entries';

// Where the deck goes, as a position in the talk that is on: one on, one back
// — clamped to the talk, so the first slide has no "back" to fall off and the
// last no "next" — or straight to the slide picked from the list.
const position = { $ref: '$.current.position' };
const last = { $sub: [{ $ref: '$.current.count' }, 1] };
const talk = { $ref: '$.current.talk_id' };

export const deckNextPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', talk, position: { $min: { over: [{ $add: [position, 1] }, last] } } },
};

export const deckBackPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', talk, position: { $max: { over: [{ $sub: [position, 1] }, 0] } } },
};

export const deckPickPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', talk, position: { $max: { over: [{ $min: { over: [{ $ref: '$.picked' }, last] } }, 0] } } },
};
