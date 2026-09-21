import type { ActionFragment } from '@niscorp/nova';
import { ATTENTION_CHANNEL } from '@encore/app/actions/frame/assist-answer.action';

// WHY IS THIS CARD HERE? — asked of every card in the room, answered once.
//
// A room that assembles itself owes the person in it an account of itself. Each
// card the loop mounts is composed `with: ['placed']`, so it arrives wearing a
// one-line tag: who put it up and how sure they were.
//
//   jev 0.89        the fast model, and its probability that the card belongs
//   you             a chip the operator clicked
//   120b · step 2   the text model, and which step of its plan opened it
//
// A fragment and not a field, on purpose (AGENTS rule 3): provenance is chrome,
// the same on all fourteen cards, and none of them should know it exists. The
// loop seeds `placedBy` with everything else it opens a card with and rewrites
// it in place as Jev's confidence moves, so the tag is live — a card you can
// watch going from 0.91 to 0.58 is a card you know is about to leave.
//
// IT ALSO MAKES EVERY CARD CITABLE, for the same reason and in the same place. A
// card carries a key (`citeKey`, seeded with everything else it is opened with)
// and sits inside a Spotlight: pointing at the card announces its key on the
// `attention` channel, and hearing a key on that channel — from another card,
// or from a sentence of an answer that stands on this one — sets `lit`, which
// the Spotlight compares with its own key. No card knows it can be cited, and
// nothing here knows what cites it.
export const PLACED_FRAGMENT = 'placed';
export const PLACED_BY = 'placedBy';
export const CITE_KEY = 'citeKey';
// LAYER TWO: why this card is here, in one plain line with confidence in WORDS,
// closed until somebody asks. The probability tag above it is layer three.
export const WHY = 'why';

export const placedFragment: ActionFragment = {
  kind: 'fragment',
  id: PLACED_FRAGMENT,
  data: { [PLACED_BY]: '', [CITE_KEY]: '', [WHY]: '', whyOpen: false, xray: false, lit: '' },
  layout: {
    component: 'Stack',
    props: { gap: 4 },
    children: [
      { if: '$.xray', then: { component: 'Row', props: { justify: 'end' }, children: [{ component: 'Text', props: { value: `$.${PLACED_BY}`, variant: 'tag', tone: 'mute' } }] }, else: '' },
      { component: 'Spotlight', ref: 'spot', props: { value: `$.${CITE_KEY}`, active: '$.lit' }, children: [{ slot: 'body' }] },
      {
        if: '$.whyOpen',
        then: { component: 'Row', props: { gap: 8, align: 'start', justify: 'between' }, children: [{ component: 'Text', props: { value: `$.${WHY}`, tone: 'mute' } }, { component: 'Button', ref: 'whyHide', props: { label: 'hide', variant: 'quiet' } }] },
        else: { component: 'Row', props: { justify: 'end' }, children: [{ component: 'Button', ref: 'why', props: { label: 'why?', variant: 'quiet' } }] },
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'why', do: [{ set: 'whyOpen', value: true }] },
    { event: 'ui:click', ref: 'whyHide', do: [{ set: 'whyOpen', value: false }] },
    { event: 'ui:focus', ref: 'spot', do: [{ emit: { channel: ATTENTION_CHANNEL, payload: '@event.payload' } }] },
    { event: 'ui:blur', ref: 'spot', do: [{ emit: { channel: ATTENTION_CHANNEL, payload: '' } }] },
    { message: ATTENTION_CHANNEL, do: [{ set: 'lit', value: '@event.payload' }] },
  ],
};
