import { deckAdvance, deckGo } from '@lyceum/app/vex/deck.entries';

const position = { $ref: '$.current.position' };
const last = { $sub: [{ $ref: '$.current.count' }, 1] };
const talk = { $ref: '$.current.talk_id' };
const step = { $ref: '$.step.step' };

// Next shows the slide's next part while it has one, then the next slide from its start.
const more = { $gt: [{ $sub: [{ $ref: '$.step.parts' }, 1] }, step] };
export const deckNextPrism = {
  fingerprint: deckAdvance.fingerprint,
  context: {
    deck: 'talk',
    talk,
    position: { $case: { branches: [{ when: more, then: position }], else: { $min: { over: [{ $add: [position, 1] }, last] } } } },
    step: { $case: { branches: [{ when: more, then: { $add: [step, 1] } }], else: { $const: 0 } } },
  },
};

// Back hides the part shown last while there is one, then the slide before, from its start.
const shown = { $gt: [step, 0] };
export const deckBackPrism = {
  fingerprint: deckAdvance.fingerprint,
  context: {
    deck: 'talk',
    talk,
    position: { $case: { branches: [{ when: shown, then: position }], else: { $max: { over: [{ $sub: [position, 1] }, 0] } } } },
    step: { $case: { branches: [{ when: shown, then: { $sub: [step, 1] } }], else: { $const: 0 } } },
  },
};

export const deckPickPrism = {
  fingerprint: deckGo.fingerprint,
  context: { deck: 'talk', talk, position: { $max: { over: [{ $min: { over: [{ $ref: '$.picked' }, last] } }, 0] } } },
};
