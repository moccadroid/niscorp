import type { LayoutNode } from '@niscorp/nova';

export const dockLayout: LayoutNode = {
  component: 'Dock',
  children: [
    {
      component: 'Row',
      children: [
        {
          component: 'Row',
          children: [
            {
              for: '$.screens',
              as: 'screen',
              key: 'id',
              do: { component: 'Button', ref: 'screen', props: { label: '$screen.label', value: '$screen.id', tone: { $if: { $eq: ['$screen.id', '$.current.screen'] }, $then: 'chosen', $else: 'choice' } } },
            },
          ],
        },
        {
          component: 'Row',
          children: [
            { component: 'Button', ref: 'back', props: { label: '←', tone: 'step' } },
            { component: 'Button', ref: 'stack', props: { label: '{{$.current.label}} · {{$.current.position}}/{{$.current.total}}', tone: 'summary' } },
            { component: 'Button', ref: 'forward', props: { label: '→', tone: 'step' } },
          ],
        },
      ],
    },
    {
      if: '$.listing',
      then: {
        component: 'Menu',
        children: [
          { if: '$.current.question', then: { component: 'Text', props: { tone: 'strong' }, children: '{{$.current.question}}' } },
          { if: '$.current.response', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$.current.response}}' } },
          {
            for: '$.current.stack',
            as: 'entry',
            key: 'position',
            do: {
              component: 'Button',
              ref: 'entry',
              props: { label: '{{$entry.position}}. {{$entry.label}}', value: '$entry.position', tone: { $if: { $eq: ['$entry.position', '$.current.position'] }, $then: 'chosen', $else: 'choice' } },
            },
          },
        ],
      },
    },
    {
      component: 'Prompt',
      children: [
        { component: 'Input', ref: 'text', model: '$.text', props: { placeholder: 'What would you like to see?', clearOnEnter: true } },
        { component: 'Button', ref: 'send', props: { label: { $if: '$.asking', $then: 'Asking…', $else: 'Send' } } },
        { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
      ],
    },
  ],
};
