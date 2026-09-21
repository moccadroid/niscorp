import type { ActionFragment } from '@niscorp/nova';
import { TILE_HUE, TILE_SPAN, TILE_TAG } from '@encore/app/canvas-placement';
import { labelAdd } from '@encore/app/vex/watch.entries';

// A CARD THE ROOM RAISED BY ITSELF — and the only place a label is written.
//
// Nobody typed anything. Something happened on site, Jev was asked whether it
// was worth a pair of eyes, and this card went up on `attention` wearing this:
// what happened, how urgent the fast model thought it was, and two buttons.
//
// BOTH BUTTONS ARE A LABEL. "Keep" says the raise was right; "dismiss" says it
// was not, and takes the card down. Either way the click writes one row —
// through a declared endpoint, a vex mutation, stamped with who clicked by the
// engine — carrying the probabilities of the pass that raised the card
// (`raisedWith`). That row is the calibration record: whether "0.8" means four
// in five is measured here, per question, from the operator's own hand. The
// event pass itself writes nothing; the law is that a person does.
//
// A fragment and not fourteen edits (rule 3): any view can be raised, and none
// of them knows it.
export const RAISED_FRAGMENT = 'raised';

const labelPrism = { fingerprint: labelAdd.fingerprint, context: { verdict: { $ref: '$.verdict' }, actionId: { $ref: '$.raisedCard' }, cause: { $ref: '$.cause' }, probabilities: { $ref: '$.raisedWith' } } };

export const raisedFragment: ActionFragment = {
  kind: 'fragment',
  id: RAISED_FRAGMENT,
  data: { cause: '', causeLine: '', raisedAt: '', raisedBand: '', raisedTone: 'mute', raisedBy: '', raisedWith: '{}', raisedCard: '', xray: false, [TILE_SPAN]: 'regular', [TILE_HUE]: 'teal', [TILE_TAG]: '', verdict: '', labelled: '', labelError: '' },
  layout: {
    // A tile like any other card's, PINNED: what the room raised reads first,
    // ahead of whatever the sentence put up. Severity, when, one sentence, and
    // the operator's two words.
    component: 'Tile',
    props: { span: `$.${TILE_SPAN}`, accent: `$.${TILE_HUE}`, pin: true },
    children: [
      {
        component: 'Stack',
        props: { gap: 6 },
        children: [
          {
            component: 'Row',
            props: { gap: 8, align: 'center', justify: 'between' },
            children: [
              {
                component: 'Row',
                props: { gap: 8, align: 'center' },
                children: [
                  { component: 'Badge', props: { label: '$.raisedBand', tone: '$.raisedTone' } },
                  { component: 'Text', props: { value: '$.raisedAt', variant: 'tag', tone: 'mute' } },
                  { if: '$.xray', then: { component: 'Text', props: { value: '$.raisedBy', variant: 'tag', tone: 'mute' } }, else: '' },
                ],
              },
              {
                component: 'Row',
                props: { gap: 4, align: 'center' },
                children: [
                  { if: '$.labelled', then: { component: 'Badge', props: { label: '$.labelled', tone: 'good' } }, else: { component: 'Button', ref: 'keep', props: { label: 'keep', variant: 'quiet' } } },
                  { component: 'Button', ref: 'dismiss', props: { label: 'dismiss', variant: 'quiet' } },
                ],
              },
            ],
          },
          { component: 'Text', props: { value: '$.causeLine' } },
          { slot: 'body' },
        ],
      },
    ],
  },
  endpoints: {
    label: { url: '/api/feeds/vex', method: 'POST', request: labelPrism, errorTarget: 'labelError' },
  },
  triggers: [
    { event: 'ui:click', ref: 'keep', do: [{ set: 'verdict', value: 'kept' }, { call: 'label', onSuccess: [{ set: 'labelled', value: 'kept' }] }] },
    { event: 'ui:click', ref: 'dismiss', do: [{ set: 'verdict', value: 'dismissed' }, { call: 'label' }] },
  ],
};
