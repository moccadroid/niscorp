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
    'tools.xray',
    'Give everyone the X-ray',
    ['Everyone’s main screen gets a large blue X-ray button. Pressed, it shows their screen as data: every action on it, and each one’s data.', 'Take it back the same way.'],
    'There is no X-ray action yet, and nothing to give it with.',
  ),
  cue(
    'tools.button',
    'Give three people the button',
    ['Three people, picked at random, get a button on their main screen. Pressed, it plays a sound.', 'Take it back the same way.'],
    'There is no button action yet, and nothing to give it with.',
  ),
  cue(
    'tools.renderers',
    'Draw it another way',
    ['React, then Vue: the same data, drawn by another renderer.', 'Terminal: the projector goes black and types out the SSH command.'],
    'Only the stylesheet switch exists (above). React, Vue and the terminal view do not.',
  ),
  cue(
    'tools.refusal',
    'Put a refusal on the wall',
    ['The latest refused query: its reason on the projector, never its words.'],
    'Refused queries are only counted.',
  ),
  cue(
    'tools.reflex',
    'Show the saved timer',
    ['Put the reflex the speaker saved on the projector, as the row it is.'],
    'The slide shows a sketch of a reflex.',
  ),
  cue(
    'tools.fire',
    'Fire the timer now',
    ['Rehearsal fallback: run the saved timer now, so the close lands on cue whatever the clock says.'],
    'Nothing can run a saved timer early.',
  ),
];
