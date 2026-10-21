// What an area holds: an action opened with its input, and why it is there, in words — what the model and Jev read
// when the next message arrives.
export type Canvas = { action: string; input: Record<string, unknown>; intent: string };

// A screen is canvases shown together, in an arrangement of its own, opened from the dock without asking anything. The
// first is the one the app opens on.
export type Screen = { id: string; label: string; description: string; arrangement: string; canvases: Canvas[] };

const WELCOME: Canvas = {
  action: 'answer.text',
  input: {
    title: 'Welcome to nisc',
    text: 'This app explains nisc. Ask about it below: the answer is a screen put together from these cards.',
    examples: ['What is nisc?', 'What is an action?', 'How does my message become a screen?', 'Who may do what?', 'How do I make this app mine?'],
  },
  intent: 'what this app is, and what can be asked of it',
};

const card = (action: string, intent: string): Canvas => ({ action, input: {}, intent });

export const SCREENS: readonly Screen[] = [
  {
    id: 'start',
    label: 'Start',
    description: 'What this app and nisc are, actions, how a message becomes a screen, and how to make the app yours.',
    arrangement: 'hero',
    canvases: [WELCOME, card('guide.nisc', 'what nisc is'), card('guide.actions', 'what an action is'), card('guide.answers', 'how a message becomes a screen'), card('guide.yours', 'how to make the app yours')],
  },
  {
    id: 'inside',
    label: 'Under the hood',
    description: 'Layouts and the kit, the shell and moss, reads and writes, and the charter.',
    arrangement: 'grid',
    canvases: [card('guide.layouts', 'what layouts and the kit are'), card('guide.shell', 'what the shell and moss are'), card('guide.data', 'how reads and writes work'), card('guide.charter', 'what the charter decides')],
  },
];
