import type { Producer } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import { CARDS_ON_A_SCREEN } from '../../app/screens';
import type { Screen } from '../../app/screens';
import type { Catalog } from './catalog';
import type { Exchange } from './history';
import type { Person } from './person';
import { recordOf } from './record';
import type { Seen } from './screen';

export type ComposerDeps = { catalog: Catalog; screens: readonly Screen[]; person: Person; seen: Seen };

const json = (value: unknown): string => JSON.stringify(value);

const withoutDialect = (schema: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(recordOf(schema)).filter(([key]) => key !== '$schema'));

export const INSTRUCTIONS = [
  'You are Mira, the assistant of one person: your person, described under YOUR PERSON. You care about them, and you call them by their name once you know it.',
  `Every answer is a screen: up to ${CARDS_ON_A_SCREEN} cards in one to three columns, each card one of the ACTIONS opened with an input. Your reply's data is the screen after your answer: keep a card that is on THE SCREEN by its title, add a card from ACTIONS with its input, or open one of the SCREENS. Change only what the message asks for and keep everything else. When no action shows the answer, put it on an answer.text card.`,
  'Your `response` is what you say to your person, every time: one or two short, plain sentences that answer them. Never describe the screen, and never say something happened that did not. Everything your person reads — your response and the words on cards — is in plain words, never ids.',
  "If you don't know your person's name yet, ask for it. When they tell you, open people.me with it; it is saved only when they press Save.",
].join('\n');

export const actionCatalog = (({ deps }) =>
  [
    'ACTIONS — the cards you can add to the screen: id — what it shows, then the input schema it is opened with',
    ...deps.catalog.actions.map((action) => `${action.id} — ${action.description}\n  input: ${json(withoutDialect(action.schema))}`),
  ].join('\n')) satisfies Producer<ComposerDeps>;

export const screenCatalog = (({ deps }) => ['SCREENS — ready-made screens your person can open from the dock', ...deps.screens.map((screen) => `${screen.id} — ${screen.description}`)].join('\n')) satisfies Producer<ComposerDeps>;

export const aboutMira = (({ deps }) =>
  [
    'ABOUT MIRA — for when your person asks about the app',
    `- An answer is a screen of up to ${CARDS_ON_A_SCREEN} cards in one to three columns. When the cards do not all fit, all but one shrink to their titles; your person taps one to open it.`,
    '- Every answer stays in a stack. Back and forward in the dock, the arrow keys, or swiping (right for back, left for forward) move through it. The chip in the dock names the answer shown; pressing it shows every answer side by side.',
    `- The dock at the bottom holds the chip with back and forward, the line your person types in, and the screens: ${deps.screens.map((screen) => screen.label).join(', ')}. Your response is kept in the Conversation, and shown under the chip when the screen does not change.`,
  ].join('\n')) satisfies Producer<ComposerDeps>;

// Their local date and time, in the zone their device gave; the server's, until it has.
const timeIn = (zone: string | undefined, now: Date): string => {
  const asked = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } as const;
  try {
    return `${new Intl.DateTimeFormat('en-GB', { ...asked, timeZone: zone }).format(now)} (${zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  } catch {
    return `${new Intl.DateTimeFormat('en-GB', asked).format(now)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  }
};

export const yourPerson = (({ deps }) =>
  [
    'YOUR PERSON',
    `- Name: ${deps.person.name ?? 'not known yet'}`,
    deps.person.owner ? '- They own this Mira and invite the other people who use it.' : '- The owner of this Mira invited them.',
    `- Their local date and time: ${timeIn(deps.seen.zone, new Date())}.`,
  ].join('\n')) satisfies Producer<ComposerDeps>;

// The answer shown as nova holds it: its title, the screen it is when it is one of the SCREENS, its columns, and its cards
// in order, each with its title, action, width and live data. The dock, which the model cannot change, in words.
const screenLines = (seen: Seen): string[] => [
  'THE SCREEN — what your person sees right now: the answer shown, as nova holds it (its cards in order, each with its action, width and live data):',
  json({ title: seen.label, ...(seen.screenId === undefined ? {} : { screen: seen.screenId }), columns: seen.columns, cards: seen.cards.map(({ title, action, span, data }) => ({ title, action, span, data })) }),
  ...(seen.first ? ['This is the Start screen: an answer asked here replaces all its cards.'] : []),
  `The dock under it, which you cannot change: the chip ${json(seen.chip)} (answer ${String(seen.position)} of ${String(seen.total)}: ${seen.stack.join(', ')}), back and forward, the line to type in, and the screens ${seen.screens.join(', ')}.${seen.said === undefined ? '' : ` Under the chip is what you said last: ${json(seen.said)}`}`,
];

export const theScreen = (({ deps }) => screenLines(deps.seen).join('\n')) satisfies Producer<ComposerDeps>;

// The chat so far, the oldest first: each message and what was said back to it, and the message last.
export const transcriptOf = (conversation: readonly Exchange[], message: string): Message[] => [
  ...conversation.flatMap(({ question, reply, title }): Message[] => {
    const said = reply !== '' ? reply : title;
    return [{ role: 'user', content: question }, ...(said === '' ? [] : [{ role: 'assistant' as const, content: said }])];
  }),
  { role: 'user', content: message },
];
