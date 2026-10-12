import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

const cueLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'body', 'todo'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'alert' }, children: [{ component: 'Label', children: '{{$.title}}' }] },
    { component: 'Cell', props: { area: 'body' }, children: [{ for: '$.lines', as: 'line', do: { component: 'Text', children: '{{$line.text}}' } }] },
    {
      if: '$.pending',
      then: { component: 'Cell', props: { area: 'todo', mark: 'hatch' }, children: [{ component: 'Label', children: 'Not built yet' }, { component: 'Text', children: '{{$.pending}}' }] },
    },
  ],
};

const cue = (id: string, title: string, lines: string[], pending: string): ActionDefinition => ({
  id,
  title,
  data: { title, lines: lines.map((text) => ({ text })), pending },
  layout: cueLayout,
  triggers: [],
});

export const CUE_TOOLS: readonly ActionDefinition[] = [
  cue(
    'tools.order',
    'Give everyone the order form',
    ['Everyone gets an order form on their phone: an item, a quantity, Send.', 'Asked for 18,000 cups of water, their assistant opens it filled in. Nobody presses Send.', 'Take it back the same way.'],
    'There is no order form yet, and nothing to give it with.',
  ),
];
