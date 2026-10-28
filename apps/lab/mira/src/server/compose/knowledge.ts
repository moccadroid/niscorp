import type { Producer } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import { CARDS_ON_A_SCREEN } from '../../app/screens';
import type { Screen } from '../../app/screens';
import type { Catalog } from './catalog';
import type { Exchange } from './history';
import type { Person } from './person';
import { recordOf } from './record';
import type { OpenCard, Seen } from './screen';

export type ComposerDeps = { catalog: Catalog; screens: readonly Screen[]; person: Person; seen: Seen };

const json = (value: unknown): string => JSON.stringify(value);

const withoutDialect = (schema: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(recordOf(schema)).filter(([key]) => key !== '$schema'));

export const INSTRUCTIONS = `You are Mira, the assistant of one person: YOUR PERSON, below. You care about them: you call them by their name once you know it, and you answer as someone who wants things to go well for them. They ask you for something, and you answer with a screen and a reply. The screen holds up to ${CARDS_ON_A_SCREEN} cards in one to three columns, each an action opened with an input, or words. Answer on the screen: with one of the SCREENS when it shows what was asked, never words describing it; with an action wherever one shows it; and otherwise with what you have to say on a card — an answer, an explanation, a plan, even a short reply. THE SCREEN is what your person sees as they send the message: a message may follow on from it, or from what was said before. Change only what the message asks to change; keep every other card, where it is — but an answer asked on the first screen starts from an empty screen.
Your \`response\` is what you say back to your person, every time, when you open one of the SCREENS or change the screen too: one or two short sentences, addressed to them, that answer what they asked, as a person would in conversation. It is kept in the Conversation, and shown on its own only when the screen does not change. It is read apart from the screen, so it says the answer itself, never "here is…" pointing at the screen, and never what you changed on it: asked how to boil an egg, say "About nine minutes for a firm yolk, then straight into cold water.", and put the steps on a card. Whatever your person reads — the response, and every word you put on a card — names what they see, never ids.`;

export const actionCatalog = (({ deps }) =>
  `ACTIONS — what a person sees, and the input schema\n${deps.catalog.actions.map((action) => `- ${action.id}: ${action.description} Input: ${json(withoutDialect(action.schema))}`).join('\n') || 'none'}`) satisfies Producer<ComposerDeps>;

export const screenCatalog = (({ deps }) => `SCREENS\n${deps.screens.map((screen) => `- ${screen.id}: ${screen.description}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const aboutMira = (({ deps }) =>
  [
    'ABOUT MIRA — the app you are, for when your person asks about it',
    `- An answer is a screen of up to ${CARDS_ON_A_SCREEN} cards, in one to three columns; a screen never holds more. When the cards on a screen do not all fit, all but one fold to their titles, and your person taps one open.`,
    '- Every answer stays in a stack. Back and forward in the dock, the arrow keys, or swiping the answer right for back and left for forward go through it; the chip in the dock names the answer shown, and pressing it lays every answer out side by side.',
    `- The dock, at the bottom, holds the chip with back and forward beside it, the line your person asks in, and the screens: ${deps.screens.map((screen) => screen.label).join(', ')}. Your response is kept in the Conversation, and shown under the chip only when the screen does not change.`,
    '- A question about Mira itself is answered on a card, in words, as well as in your response.',
  ].join('\n')) satisfies Producer<ComposerDeps>;

// The time where they are, in the zone their device gave; the server's, until it has.
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
    deps.person.name === undefined
      ? '- Their name: you do not know it yet. Ask them what they would like you to call them, and when they tell you, open the You card (people.me) with it, for them to save.'
      : `- Their name: ${json(deps.person.name)}.`,
    deps.person.owner ? '- They own this Mira, and invite everybody else who may sign in.' : '- The owner of this Mira invited them.',
    `- Their time now: ${timeIn(deps.seen.zone, new Date())}.`,
  ].join('\n')) satisfies Producer<ComposerDeps>;

const cardSays = (card: OpenCard): string => {
  const what = card.action === 'answer.text' ? `words: ${json(card.input['text'])}` : `${card.action}, opened with ${json(card.input)}`;
  const shows = Object.keys(card.shows).length > 0 ? ` — shows ${json(card.shows)}` : '';
  return `${json(card.title)} — ${what}${shows}`;
};

const cardLine = (card: OpenCard, at: number): string => `${String(at + 1)}. ${cardSays(card)}`;


const screenLines = (seen: Seen): string[] => {
  const where = `${String(seen.position)} of ${String(seen.total)} in the stack (${seen.stack.join(', ')})`;
  return [
    'THE SCREEN — what your person sees as they send the message',
    ...(seen.first
      ? [`The first screen, ${json(seen.label)}, ${where}: it welcomes your person, and shows ${seen.cards.map(cardSays).join('; ')}.`]
      : [`The answer shown: ${seen.screen ? `the ${seen.label} screen` : json(seen.label)}, ${where}. Its cards in reading order, in ${seen.columns === 1 ? 'one column' : `${String(seen.columns)} columns`}:`, ...seen.cards.map(cardLine)]),
    `The dock: the chip naming ${json(seen.chip)}, back and forward beside it${seen.said === undefined ? '' : `; under it, what you said back last: ${json(seen.said)}`}; the line; the screens ${seen.screens.join(', ')}.`,
  ];
};

export const theScreen = (({ deps }) => screenLines(deps.seen).join('\n')) satisfies Producer<ComposerDeps>;

// The chat so far, the oldest first: each message and what was said back to it, and the message last.
export const transcriptOf = (conversation: readonly Exchange[], message: string): Message[] => [
  ...conversation.flatMap(({ question, reply, title }): Message[] => {
    const said = reply !== '' ? reply : title;
    return [{ role: 'user', content: question }, ...(said === '' ? [] : [{ role: 'assistant' as const, content: said }])];
  }),
  { role: 'user', content: message },
];
