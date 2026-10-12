import type { ActionFragment } from '@niscorp/nova';
import { TILE_HUE, TILE_SPAN, TILE_TAG } from '@encore/app/canvas-placement';
import { labelAdd } from '@encore/app/vex/watch.entries';

export const RAISED_FRAGMENT = 'raised';

const labelPrism = { fingerprint: labelAdd.fingerprint, context: { verdict: { $ref: '$.verdict' }, actionId: { $ref: '$.raisedCard' }, cause: { $ref: '$.cause' }, probabilities: { $ref: '$.raisedWith' } } };

export const raisedFragment: ActionFragment = {
  kind: 'fragment',
  id: RAISED_FRAGMENT,
  data: { cause: '', causeLine: '', raisedAt: '', raisedBand: '', raisedTone: 'mute', raisedBy: '', raisedWith: '{}', raisedCard: '', [TILE_SPAN]: 'regular', [TILE_HUE]: 'teal', [TILE_TAG]: '', verdict: '', labelled: '', labelError: '' },
  layout: {
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
