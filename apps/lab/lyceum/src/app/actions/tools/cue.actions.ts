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
    'tools.terminal',
    'Open the terminal door',
    ['In a terminal beside the slides: ssh -p 2222 lyceum.moccadroid.com', 'Any user name, no password. Step in; press a tab by its number.'],
    '',
  ),
  cue(
    'tools.screen',
    'Show a phone as the assistant sees it',
    ['Pick a phone in the room. The projector shows it beside its text-kit drawing.'],
    'There is nothing to pick a phone with, and no stage view to put it on.',
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
