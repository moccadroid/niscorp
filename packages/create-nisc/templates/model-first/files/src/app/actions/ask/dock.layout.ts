import type { LayoutNode } from '@niscorp/nova';

export const dockLayout: LayoutNode = {
  component: 'Dock',
  children: [
    { component: 'Talk', children: [{ component: 'CanvasSlot', props: { canvasId: 'talk' } }] },
    {
      component: 'Row',
      children: [
        {
          for: '$.screens',
          as: 'screen',
          key: 'id',
          do: { component: 'Button', ref: 'screen', props: { label: '$screen.label', value: '$screen.id', tone: { $if: { $eq: ['$screen.id', '$.shown.screen'] }, $then: 'chosen', $else: 'choice' } } },
        },
      ],
    },
    {
      component: 'Prompt',
      children: [
        { component: 'Input', ref: 'text', model: '$.text', props: { placeholder: 'Ask anything', clearOnEnter: true } },
        { component: 'Button', ref: 'send', props: { label: 'Send' } },
        { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
      ],
    },
  ],
};
