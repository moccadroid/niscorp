import { greetingAdd, greetingsCount, greetingsList, greetingsPerLanguage } from './vex/greetings.entries';

// What an area holds: an action opened with its input, and why it is there, in words — what the model and Jev read
// when the next message arrives.
export type Canvas = { action: string; input: Record<string, unknown>; intent: string };

// A screen is canvases shown together, in an arrangement of its own, opened from the dock without asking anything. The
// first is the one the app opens on.
export type Screen = { id: string; label: string; description: string; arrangement: string; canvases: Canvas[] };

const EXAMPLES: readonly string[] = ['Show me every greeting', 'How many greetings are there?', 'Greetings per language', 'Which greetings are in German?', 'Add a greeting that says Servus'];

const ABOUT: Canvas = {
  action: 'answer.text',
  input: { title: 'Greetings app', text: 'Ask for something in the line below. The answer is a screen, put together from this app’s actions.', examples: [...EXAMPLES] },
  intent: 'what this app is, and what can be asked of it',
};

const COUNT: Canvas = { action: 'rows.stat', input: { title: 'Greetings', read: greetingsCount.fingerprint, params: {}, label: 'greetings' }, intent: 'how many greetings there are' };

const PER_LANGUAGE: Canvas = { action: 'rows.bars', input: { title: 'Greetings per language', read: greetingsPerLanguage.fingerprint, params: {} }, intent: 'how many greetings each language has' };

const TABLE: Canvas = {
  action: 'rows.table',
  input: {
    title: 'Greetings',
    read: greetingsList.fingerprint,
    params: {},
    columns: [
      { key: 'text', label: 'Greeting' },
      { key: 'language', label: 'Language' },
    ],
  },
  intent: 'every greeting',
};

const ADD: Canvas = {
  action: 'rows.form',
  input: {
    title: 'Add a greeting',
    write: greetingAdd.fingerprint,
    fields: [
      { key: 'text', label: 'Greeting', value: '' },
      { key: 'language', label: 'Language', value: '' },
    ],
  },
  intent: 'a form to add a greeting',
};

export const SCREENS: readonly Screen[] = [
  { id: 'overview', label: 'Overview', description: 'What the app is, how many greetings there are, the greetings per language, every greeting, and a form to add one.', arrangement: 'hero', canvases: [ABOUT, COUNT, PER_LANGUAGE, TABLE, ADD] },
  { id: 'greetings', label: 'Greetings', description: 'Every greeting, and a form to add one.', arrangement: 'pair', canvases: [TABLE, ADD] },
  { id: 'languages', label: 'Languages', description: 'The greetings per language, and how many there are.', arrangement: 'pair', canvases: [PER_LANGUAGE, COUNT] },
];
