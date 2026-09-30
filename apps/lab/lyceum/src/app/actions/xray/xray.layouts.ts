import type { LayoutNode } from '@niscorp/nova';

// Every action on the screen, one under the other: what it is
// and its data as it stands. Look again after tapping around.
export const xrayViewLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick again', 'list list'], cols: [2, 1], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'X-ray · your screen, as data' }] },
    { component: 'Action', ref: 'again', props: { area: 'again', ink: 'ink', label: 'Look again' } },
    {
      component: 'Cell',
      props: { area: 'list', pad: 'none', scroll: 'y' },
      children: [
        {
          component: 'Sheet',
          children: [
            {
              for: '$.screen',
              as: 'instance',
              do: {
                component: 'Cell',
                children: [
                  { component: 'Label', children: '{{$instance.name}}' },
                  { component: 'Code', props: { text: '$instance.data' } },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};
