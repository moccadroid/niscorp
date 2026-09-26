import type { Sequence } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';

// Shared by the document stories: a nova action as an add-on would store it,
// and the app kit's own grammar — Button's `label` prop is now `text`, said
// ONCE, as a Prism config over one node.

const doc = { $ref: '$.document' };

export const renameLabel = {
  $case: {
    branches: [
      {
        when: { $eq: [{ $get: { from: doc, path: ['component'], fallback: null } }, 'Button'] },
        then: {
          $merge: [
            { $omit: { from: doc, keys: ['props'] } },
            {
              props: {
                $merge: [
                  { $omit: { from: { $get: { from: doc, path: ['props'], fallback: { $const: {} } } }, keys: ['label'] } },
                  { text: { $get: { from: doc, path: ['props', 'label'], fallback: null } }, __optional: ['text'] },
                ],
              },
            },
          ],
        },
      },
    ],
    else: doc,
  },
};

export const kit: Sequence = {
  id: 'acme.kit',
  migrations: [{ description: 'Button: label → text', steps: [{ kind: 'document', at: 'nisc.nova/layout', transform: renameLabel }] }],
};

// The grammars a deployment speaks: nova's and Prism's as they ship, then the app's.
export const grammars: readonly Sequence[] = [NOVA_SEQUENCE, PRISM_SEQUENCE, kit];

// A stamp with nova and Prism where they ship today and the kit at `kit` — so
// the stories keep saying what they say as nova's and Prism's grammars move on.
export const stampAt = (kit: number | undefined): Record<string, number> => ({
  'nisc.nova': NOVA_SEQUENCE.migrations.length,
  'nisc.prism': PRISM_SEQUENCE.migrations.length,
  ...(kit === undefined ? {} : { 'acme.kit': kit }),
});

export const action = {
  id: 'ext.member.acme.classes',
  title: 'Classes',
  data: { rows: [], q: '', admin: false },
  layout: {
    component: 'Stack',
    children: [
      { component: 'Input', model: '$.q' },
      { component: 'Button', ref: 'add', props: { label: 'Book a class', tone: 'primary' } },
      {
        for: '$.rows',
        as: 'row',
        do: { component: 'Card', children: { component: 'Button', ref: 'open', props: { label: 'Open' } } },
      },
      { if: '$.admin', then: { component: 'Button', ref: 'cancel', props: { label: 'Cancel class' } }, else: { component: 'Text', props: { value: 'Members only' } } },
    ],
  },
  endpoints: {
    load: { url: '/api/acme/vex', method: 'POST', request: { fingerprint: 'classes/open', context: { q: { $ref: '$.q' } } }, target: 'rows' },
  },
};
