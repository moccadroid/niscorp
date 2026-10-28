import type { LayoutNode } from '@niscorp/nova';

const asked = (opens: Record<string, unknown>, ref?: string): LayoutNode => ({ component: 'Button', ...(ref === undefined ? {} : { ref }), props: { tone: 'asked', label: '$exchange.question', ...opens } });

export const conversationLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Conversation', tone: 'log' },
  children: [
    { if: { $eq: ['$.exchanges.length', 0] }, then: { component: 'Text', props: { tone: 'muted' }, children: 'Nothing asked yet.' } },
    {
      for: '$.exchanges',
      as: 'exchange',
      key: 'id',
      do: {
        component: 'Row',
        props: { tone: 'exchange' },
        children: [
          {
            if: '$exchange.position',
            then: asked({ value: '$exchange.position' }, 'opens-answer'),
            else: { if: '$exchange.screen', then: asked({ value: '$exchange.screen' }, 'opens-screen'), else: asked({ disabled: true }) },
          },
          { component: 'Text', props: { tone: 'reply' }, children: '{{$exchange.reply}}' },
        ],
      },
    },
  ],
};
