import type { LayoutNode } from '@niscorp/nova';

// A row per surface, a button per renderer; the one drawing it now is marked.
export const lookLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    areas: [
      'kick kick kick kick',
      'phones phones-dom phones-react phones-vue',
      'stage stage-dom stage-react stage-vue',
      'controller controller-dom controller-react controller-vue',
    ],
    cols: [2, 1, 1, 1],
  },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Which renderer draws each kind of screen' }] },
    { for: '$.rows', as: 'row', do: { component: 'Cell', props: { area: '$row.surface' }, children: [{ component: 'Label', children: '{{$row.label}}' }] } },
    {
      for: '$.rows',
      as: 'row',
      do: {
        for: '$row.choices',
        as: 'choice',
        do: {
          component: 'Action',
          ref: 'renderer',
          props: {
            area: '{{$row.surface}}-{{$choice.value.renderer}}',
            ink: { $if: '$choice.on', $then: 'highlight', $else: 'paper' },
            label: '{{$choice.label}}',
            value: '$choice.value',
          },
        },
      },
    },
  ],
};
