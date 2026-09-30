import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// CUES: controller tools for the demos a slide leans on. Each says what the
// speaker does while its slide is up; one whose `pending` is not empty is a
// demo that is not built yet, drawn hatched — the deck can be walked, and
// every missing beat is on the controller as well as the wall.

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
    'tools.button',
    'Give three people the button',
    ['Three people, picked at random, get a button on their phone. Pressed, it plays a sound.', 'Take it back the same way.'],
    'There is no button action yet, and nothing to give it with.',
  ),
  cue(
    'tools.renderers',
    'The terminal',
    ['The projector goes black and types out the SSH command. The same trees, in a terminal.'],
    'The switch above draws each surface with DOM, React or Vue. The projector’s terminal view does not exist yet.',
  ),
  cue(
    'tools.order',
    'Give everyone the order form',
    ['Everyone gets an order form on their phone: an item, a quantity, Send.', 'Asked for 18,000 cups of water, their assistant opens it filled in. Nobody presses Send.', 'Take it back the same way.'],
    'There is no order form yet, and nothing to give it with.',
  ),
];
