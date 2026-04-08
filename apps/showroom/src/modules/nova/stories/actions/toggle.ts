import type { ActionStory } from '../../story-types';

export const toggleStory: ActionStory = {
  id: 'toggle',
  name: 'Toggle',
  description:
    'Demonstrates the `toggle` data op together with an `if/then/else` layout node. Click Toggle — `enabled` flips, and the conditional swaps between a green "Enabled" and a red "Disabled" Text on the next render.',
  kind: 'action',
  category: 'Basics',
  action: {
    id: 'toggle',
    data: { enabled: false },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 16, padding: 24 },
      children: [
        {
          if: '$.enabled',
          then: {
            component: 'Text',
            props: { weight: 'bold', color: '#16a34a' },
            children: 'Enabled',
          },
          else: {
            component: 'Text',
            props: { weight: 'bold', color: '#dc2626' },
            children: 'Disabled',
          },
        },
        { component: 'Button', ref: 'flip', children: 'Toggle' },
      ],
    },
    triggers: [
      { event: 'ui:click', ref: 'flip', do: [{ toggle: 'enabled' }] },
    ],
  },
  expected: { textIncludes: ['Disabled', 'Toggle'] },
};
