export type Canvas = { action: string; input: Record<string, unknown>; intent: string };
export type Screen = { id: string; label: string; description: string; arrangement: string; ink: string; canvases: Canvas[] };

// A person is shown the screens whose every action they hold.
export const SCREENS: readonly [Screen, ...Screen[]] = [
  {
    id: 'start',
    label: 'Start',
    description: 'What this app is, and things to ask it.',
    arrangement: 'pair',
    ink: 'screen-1',
    canvases: [
      { action: 'answer.text', input: { title: 'Mira', text: 'Ask for what you want to see. The answer is a screen of cards, and every screen stays in the deck.', tone: 'hero' }, intent: 'what this app is' },
      { action: 'ask.suggestions', input: { title: 'Try asking', suggestions: ['What can you do?', 'Plan a long weekend in November'] }, intent: 'things to ask' },
    ],
  },
  { id: 'people', label: 'People', description: 'Everybody who may sign in, and inviting somebody.', arrangement: 'single', ink: 'screen-2', canvases: [{ action: 'people.list', input: {}, intent: 'who may sign in' }] },
];
