export type Canvas = { action: string; input: Record<string, unknown>; intent: string };

export type Screen = { id: string; label: string; description: string; arrangement: string; canvases: Canvas[] };

export const SCREENS: readonly [Screen, ...Screen[]] = [
  { id: 'start', label: 'Start', description: 'What this app is.', arrangement: 'single', canvases: [{ action: 'answer.text', input: { title: 'Mira', text: 'An assistant, in the making.' }, intent: 'what this app is' }] },
];
