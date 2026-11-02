import type { LayoutNode } from '@niscorp/nova';
import { RENDERERS, SURFACES } from '@lyceum/app/vex/renderer.entries';

const rowOf = (surface: string): string => [surface, ...RENDERERS.map((renderer) => `${surface}-${renderer}`)].join(' ');

export const lookLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    areas: [Array.from({ length: RENDERERS.length + 1 }, () => 'kick').join(' '), ...SURFACES.map(rowOf)],
    cols: [2, ...RENDERERS.map(() => 1)],
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
