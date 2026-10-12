import type { ActionFragment } from '@niscorp/nova';
import { ATTENTION_CHANNEL } from '@encore/app/actions/frame/assist-answer.action';
import { TILE_HUE, TILE_SPAN, TILE_TAG } from '@encore/app/canvas-placement';

export const PLACED_FRAGMENT = 'placed';
export const PLACED_BY = 'placedBy';
export const CITE_KEY = 'citeKey';
export const WHY = 'why';
// A re-aimed card is removed and pushed again (nova's re-open rule) and starts from the
// fragment's defaults: whoever re-opens it hands over what the old one held under these keys.
export const KEPT_ACROSS_REOPEN = ['whyOpen'] as const;
export const keptAcrossReopen = (held: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(KEPT_ACROSS_REOPEN.flatMap((key) => (held[key] === undefined ? [] : [[key, held[key]]])));

export const placedFragment: ActionFragment = {
  kind: 'fragment',
  id: PLACED_FRAGMENT,
  data: { [PLACED_BY]: '', [CITE_KEY]: '', [WHY]: '', whyOpen: false, lit: '', [TILE_SPAN]: 'regular', [TILE_HUE]: 'teal', [TILE_TAG]: '' },
  layout: {
    component: 'Tile',
    props: { span: `$.${TILE_SPAN}`, accent: `$.${TILE_HUE}` },
    children: [
      {
        component: 'Stack',
        props: { gap: 4 },
        children: [
          {
            component: 'Row',
            props: { gap: 8, align: 'center', justify: 'between' },
            children: [
              { component: 'Text', props: { value: `$.${TILE_TAG}`, variant: 'kicker' } },
              { if: '$.whyOpen', then: { component: 'Button', ref: 'whyHide', props: { label: 'hide', variant: 'quiet' } }, else: { component: 'Button', ref: 'why', props: { label: 'why?', variant: 'quiet' } } },
            ],
          },
          { if: '$.whyOpen', then: { component: 'Text', props: { value: `$.${WHY}`, tone: 'mute' } }, else: '' },
          { component: 'Spotlight', ref: 'spot', props: { value: `$.${CITE_KEY}`, active: '$.lit' }, children: [{ slot: 'body' }] },
        ],
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
