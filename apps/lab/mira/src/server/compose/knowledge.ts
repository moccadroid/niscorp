import type { Producer } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { Catalog } from './catalog';
import type { Exchange } from './history';
import type { Picks } from './pick';
import { recordOf } from './record';
import type { OpenCard, Seen } from './screen';

export type ComposerDeps = { catalog: Catalog; screens: readonly Screen[]; roles: readonly string[]; seen: Seen; picks?: Picks };

const json = (value: unknown): string => JSON.stringify(value);

const withoutDialect = (schema: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(recordOf(schema)).filter(([key]) => key !== '$schema'));

export const INSTRUCTIONS = `You are Mira, an assistant. A person asks you for something, and you answer with a screen and a reply. The screen holds up to ${AREAS.length} cards in one to three columns, each an action opened with an input, or words. Answer on the screen: with one of the SCREENS when it shows what was asked, never words describing it; with an action wherever one shows it; and otherwise with what you have to say on a card — an answer, an explanation, a plan, even a short reply. THE SCREEN is what the person sees as they send the message: a message may follow on from it, or from what was said before. Change only what the message asks to change; keep every other card, where it is — but an answer asked on the first screen starts from an empty screen.
Your \`response\` is what you say back to the person, kept in the Conversation and shown on its own only when the screen does not change: one or two short sentences, addressed to them, that answer what they asked, as a person would in conversation. It is read apart from the screen, so it says the answer itself, never "here is…" pointing at the screen, and never what you changed on it: asked how to boil an egg, say "About nine minutes for a firm yolk, then straight into cold water.", and put the steps on a card. Whatever a person reads — the response, and every word you put on a card — names what they see, never ids.`;

export const actionCatalog = (({ deps }) =>
  `ACTIONS — what a person sees, and the input schema\n${deps.catalog.actions.map((action) => `- ${action.id}: ${action.description} Input: ${json(withoutDialect(action.schema))}`).join('\n') || 'none'}`) satisfies Producer<ComposerDeps>;

export const screenCatalog = (({ deps }) => `SCREENS\n${deps.screens.map((screen) => `- ${screen.id}: ${screen.description}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const aboutMira = (({ deps }) =>
  [
    'ABOUT MIRA — the app you are, for when the person asks about it',
    `- An answer is a screen of up to ${AREAS.length} cards, in one to three columns; a screen never holds more. When the cards on a screen do not all fit, all but one fold to their titles, and the person taps one open.`,
    '- Every answer stays in a stack. Back and forward in the dock, the arrow keys, or swiping the answer right for back and left for forward go through it; the chip in the dock names the answer shown, and pressing it lays every answer out side by side.',
    `- The dock, at the bottom, holds the chip with back and forward beside it, the line the person asks in, and the screens: ${deps.screens.map((screen) => screen.label).join(', ')}. Your response is kept in the Conversation, and shown under the chip only when the screen does not change.`,
    '- A question about Mira itself is answered on a card, in words, as well as in your response.',
  ].join('\n')) satisfies Producer<ComposerDeps>;

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const todayAndPerson = (({ deps }) =>
  `Today is ${DAY.format(new Date())}. You are talking with ${deps.roles.includes('owner') ? 'the owner of this Mira, who invites everybody else' : 'somebody the owner invited'}.`) satisfies Producer<ComposerDeps>;

const cardSays = (card: OpenCard): string => {
  const what = card.action === 'answer.text' ? `words: ${json(card.input['text'])}` : `${card.action} (${card.intent}), opened with ${json(card.input)}`;
  const shows = Object.keys(card.shows).length > 0 ? ` — shows ${json(card.shows)}` : '';
  return `${json(card.title)} — ${what}${shows}`;
};

const cardLine = (card: OpenCard, at: number): string => `${String(at + 1)}. ${cardSays(card)}`;

// A hint that finds nothing likely reads as "nothing belongs in the answer", so the model is not given one.
const picksLine = (picks: Picks): string | undefined => {
  const kinds = Object.entries(picks).map(([kind, scored]) => ({ kind, likely: scored.filter((item) => item.probability >= 0.5).map((item) => `${item.name} ${item.probability.toFixed(2)}`) }));
  if (kinds.every(({ likely }) => likely.length === 0)) return undefined;
  return kinds.map(({ kind, likely }) => `${kind} ${likely.length > 0 ? likely.join(', ') : 'none'}`).join('; ');
};


const screenLines = (seen: Seen): string[] => {
  const where = `${String(seen.position)} of ${String(seen.total)} in the stack (${seen.stack.join(', ')})`;
  return [
    'THE SCREEN — what the person sees as they send the message',
    ...(seen.first
      ? [`The first screen, ${json(seen.label)}, ${where}: it welcomes the person, and shows ${seen.cards.map(cardSays).join('; ')}.`]
      : [`The answer shown: ${seen.screen ? `the ${seen.label} screen` : json(seen.label)}, ${where}. Its cards in reading order, in ${seen.columns === 1 ? 'one column' : `${String(seen.columns)} columns`}:`, ...seen.cards.map(cardLine)]),
    `The dock: the chip naming ${json(seen.chip)}, back and forward beside it${seen.said === undefined ? '' : `; under it, what you said back last: ${json(seen.said)}`}; the line; the screens ${seen.screens.join(', ')}.`,
  ];
};

export const theScreen = (({ deps }) => screenLines(deps.seen).join('\n')) satisfies Producer<ComposerDeps>;

export const pickerHint = (({ deps }) => {
  const hint = deps.picks === undefined ? undefined : picksLine(deps.picks);
  return hint === undefined ? [] : `A FAST PICKER THINKS (a hint; how likely each belongs in the answer): ${hint}`;
}) satisfies Producer<ComposerDeps>;

// The chat so far, the oldest first: each message and what was said back to it, and the message last.
export const transcriptOf = (conversation: readonly Exchange[], message: string): Message[] => [
  ...conversation.flatMap(({ question, reply, title }): Message[] => {
    const said = reply !== '' ? reply : title;
    return [{ role: 'user', content: question }, ...(said === '' ? [] : [{ role: 'assistant' as const, content: said }])];
  }),
  { role: 'user', content: message },
];
