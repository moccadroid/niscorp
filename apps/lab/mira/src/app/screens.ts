export type Canvas = { action: string; input: Record<string, unknown>; intent: string };
export type Screen = { id: string; label: string; description: string; arrangement: string; canvases: Canvas[] };

// A person is shown the screens whose every action they hold.
export const SCREENS: readonly [Screen, ...Screen[]] = [
  { id: 'start', label: 'Start', description: 'What this app is.', arrangement: 'single', canvases: [{ action: 'answer.text', input: { title: 'Mira', text: 'An assistant, in the making.' }, intent: 'what this app is' }] },
  { id: 'people', label: 'People', description: 'Everybody who may sign in, and inviting somebody.', arrangement: 'single', canvases: [{ action: 'people.list', input: {}, intent: 'who may sign in' }] },
];
