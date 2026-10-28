import type { LayoutNode } from '@niscorp/nova';

const said = (opens: Record<string, unknown>, ref?: string): LayoutNode => ({ component: 'Button', ...(ref === undefined ? {} : { ref }), props: { tone: 'exchange', label: '$exchange.question', note: '$exchange.reply', ...opens } });

export const conversationLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Conversation' },
  children: [
    { if: { $eq: ['$.exchanges.length', 0] }, then: { component: 'Text', props: { tone: 'muted' }, children: 'Nothing asked yet.' } },
    {
      for: '$.exchanges',
      as: 'exchange',
      key: 'id',
      do: {
        if: '$exchange.position',
        then: said({ value: '$exchange.position' }, 'opens-answer'),
        else: { if: '$exchange.screen', then: said({ value: '$exchange.screen' }, 'opens-screen'), else: said({ disabled: true }) },
      },
    },
  ],
};
