import { deckGo } from '@lyceum/app/vex/deck.entries';

const position = { $ref: '$.current.position' };
const last = { $sub: [{ $ref: '$.current.count' }, 1] };

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
