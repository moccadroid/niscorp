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
    text: 'This app explains nisc, and a model leads it: ask below, and the answer is a screen put together from the guide’s cards.',
    examples: ['What is nisc?', 'What is an action?', 'How does my message become a screen?', 'Who may do what?', 'How do I make this app mine?'],
  },
  intent: 'what this app is, and what can be asked of it',
};

export const SCREENS: readonly Screen[] = [{ id: 'start', label: 'Start', description: 'What this app is, and what can be asked of it.', arrangement: 'single', canvases: [WELCOME] }];
