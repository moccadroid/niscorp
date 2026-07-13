import type { ActionFragment } from '@niscorp/nova';

// Modal chrome as composition, not a wrapper component (AGENTS rule 3):
// pushed alongside an action via `with: ['modal-frame']`, it wraps the
// action's layout in a panel and wires the close button.
export const modalFrame: ActionFragment = {
  kind: 'fragment',
  id: 'modal-frame',
  name: 'Modal frame',
  description: 'Panel chrome with a close button for actions loaded onto the overlay canvas.',
  layout: {
    component: 'Card',
    props: { pad: 22, radius: 20 },
    children: [
      {
        component: 'Stack',
        props: { gap: 2 },
        children: [
          {
            component: 'Stack',
            props: { direction: 'row', justify: 'end' },
            children: [
              { component: 'Button', ref: 'modal-close', props: { label: '✕', variant: 'ghost', size: 'sm' } },
            ],
          },
          { slot: 'body' },
        ],
      },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'modal-close', do: [{ pop: true }] }],
};
