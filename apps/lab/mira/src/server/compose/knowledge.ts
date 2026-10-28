import type { Producer } from '@niscorp/cortex';
import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { Catalog } from './catalog';
import type { Exchange } from './history';
import { areaRows } from './layout';
import type { Picks } from './pick';
import { recordOf } from './record';
import type { OpenCanvas } from './screen';

export type ComposerDeps = { catalog: Catalog; screens: readonly Screen[]; arrangements: readonly Arrangement[] };

const json = (value: unknown): string => JSON.stringify(value);

const withoutDialect = (schema: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(recordOf(schema)).filter(([key]) => key !== '$schema'));

export const INSTRUCTIONS = `You answer a person's message with a screen and a reply. The screen holds up to ${AREAS.length} canvases, each an action opened with an input, on the areas ${AREAS.join(', ')} of an arrangement. Answer on the screen: with one of the SCREENS when it shows what was asked, never words describing it; with an action wherever one shows it; and otherwise with what you have to say on a card — an answer, an explanation, a plan, even a short reply. The open screen is what the person sees as they send the message, and CONVERSATION what they asked before and what you replied: a message may follow on from either. Change only what the message asks to change; keep everything else exactly where it is.
Your \`response\` is what you say back to the person, kept in the Conversation and shown on its own only when the screen does not change: one or two short sentences, addressed to them, that answer what they asked, as a person would in conversation. It is read apart from the screen, so it says the answer itself, never "here is…" pointing at the screen, and never what you changed on it: asked how to boil an egg, say "About nine minutes for a firm yolk, then straight into cold water.", and put the steps on a card. Whatever a person reads — the response, and every word you put on a card — names what they see, never ids, area letters, arrangement names or fingerprints.`;

export const actionCatalog = (({ deps }) =>
  `ACTIONS — what a person sees, and the input schema\n${deps.catalog.actions.map((action) => `- ${action.id}: ${action.description} Input: ${json(withoutDialect(action.schema))}`).join('\n') || 'none'}`) satisfies Producer<ComposerDeps>;

export const readCatalog = (({ deps }) =>
  `READS — what it answers, its rows, and the params it is asked with\n${deps.catalog.reads.map((read) => `- ${read.fingerprint}: ${read.intent}. Rows: ${json(read.shape)}. Params: ${json(read.contextKeys)}`).join('\n') || 'none'}`) satisfies Producer<ComposerDeps>;

export const writeCatalog = (({ deps }) =>
  `WRITES — what it does, and the keys of the fields a form saves through it\n${deps.catalog.writes.map((write) => `- ${write.fingerprint}: ${write.intent}. Fields: ${json(write.contextKeys)}`).join('\n') || 'none'}`) satisfies Producer<ComposerDeps>;

export const screenCatalog = (({ deps }) => `SCREENS\n${deps.screens.map((screen) => `- ${screen.id}: ${screen.description}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const aboutMira = (({ deps }) =>
  [
    'ABOUT MIRA — the app you answer in, for when the person asks about it',
    `- An answer is a screen of up to ${AREAS.length} cards, laid out by an arrangement or by a grid you write, in one to three columns; a screen never holds more. When the cards asked for need more areas than the arrangement on screen has, give another arrangement, or a grid. When the cards on a screen do not all fit, all but one fold to their titles, and the person taps one open.`,
    '- Every answer stays in a stack. Back and forward in the dock, the arrow keys, or swiping the answer right for back and left for forward go through it; the chip in the dock names the answer shown, and pressing it lays every answer out side by side.',
    `- The dock, at the bottom, holds the chip with back and forward beside it, the line the person asks in, and the screens: ${deps.screens.map((screen) => screen.label).join(', ')}. Your response is kept in the Conversation, and shown under the chip only when the screen does not change.`,
    '- A question about Mira itself is answered on a card, in words, as well as in your response.',
  ].join('\n')) satisfies Producer<ComposerDeps>;

export const arrangementCatalog = (({ deps }) =>
  `ARRANGEMENTS — and their areas, row by row\n${deps.arrangements.map((arrangement) => `- ${arrangement.id}: ${arrangement.description} Areas: ${areaRows(arrangement.layout)}`).join('\n')}`) satisfies Producer<ComposerDeps>;

const canvasLine = (canvas: OpenCanvas): string => {
  const what = canvas.action === 'answer.text' ? `words ${json({ title: canvas.input['title'], text: canvas.input['text'] })}` : `input ${json(canvas.input)}`;
  const shows = Object.keys(canvas.shows).length > 0 ? ` — shows ${json(canvas.shows)}` : '';
  return `- ${canvas.area}: ${canvas.action} — ${canvas.intent} — ${what}${shows}`;
};

// A hint that finds nothing likely reads as "nothing belongs in the answer", so the model is not given one.
const picksLine = (picks: Picks): string | undefined => {
  const kinds = Object.entries(picks).map(([kind, scored]) => ({ kind, likely: scored.filter((item) => item.probability >= 0.5).map((item) => `${item.name} ${item.probability.toFixed(2)}`) }));
  if (kinds.every(({ likely }) => likely.length === 0)) return undefined;
  return kinds.map(({ kind, likely }) => `${kind} ${likely.length > 0 ? likely.join(', ') : 'none'}`).join('; ');
};

const exchangeLine = (exchange: Exchange): string => `- ${json(exchange.question)} — you replied ${json(exchange.reply)}${exchange.title === '' ? '' : `, the answer called ${json(exchange.title)}`}`;

export const messageInput = (message: string, open: readonly OpenCanvas[], arrangement: { id: string; layout: LayoutNode }, picks: Picks | undefined, conversation: readonly Exchange[]): string => {
  const hint = picks === undefined ? undefined : picksLine(picks);
  return [
    ...(conversation.length === 0 ? [] : ['CONVERSATION — what the person asked before, the oldest first', ...conversation.map(exchangeLine), '']),
    `OPEN SCREEN — arrangement ${arrangement.id}: ${areaRows(arrangement.layout)}`,
    ...(open.length === 0 ? ['nothing'] : open.map(canvasLine)),
    ...(hint === undefined ? [] : ['', `A FAST PICKER THINKS (a hint; how likely each belongs in the answer): ${hint}`]),
    '',
    `MESSAGE: ${message}`,
  ].join('\n');
};
