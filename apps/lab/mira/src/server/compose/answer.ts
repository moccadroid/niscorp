import type { Canvas } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import { opened } from './catalog';
import type { Catalog } from './catalog';
import type { ComposerDeps } from './knowledge';
import { gridLayout } from './layout';
import type { WrittenLayout } from './layout';
import { wordsCanvas } from './plan';
import type { AreaCanvases } from './plan';
import { recordOf } from './record';
import { CardSchema, cardOf, cardsOf } from './reply.schema';
import type { Card, Reply } from './reply.schema';
import type { OpenCard } from './screen';

// No layout keeps the one on screen.
export type Answer = { title: string; screen?: string; canvases: AreaCanvases; layout?: WrittenLayout };

// `open`: the cards on the screen now an answer may keep, in reading order; `columns`: how many it is laid out in.
export type AnswerContext = ComposerDeps & { open: readonly OpenCard[]; columns: number };

const canvasRefusals = (card: Card, where: string, catalog: Catalog): string[] => {
  const action = catalog.actions.find((candidate) => candidate.id === card.action);
  if (action === undefined) return [`${where}: there is no action "${String(card.action)}".`];
  const parsed = action.check.safeParse(card.input ?? {});
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${where}: input.${issue.path.join('.')}: ${issue.message}`);
};

const cardRefusals = (card: Card, where: string, catalog: Catalog): string[] => {
  const kinds = [card.keep !== undefined, card.action !== undefined || card.input !== undefined, card.say !== undefined].filter(Boolean).length;
  if (kinds !== 1) return [`${where}: give exactly one of "keep", "action" with "input", or "say".`];
  return card.keep === undefined && card.say === undefined ? canvasRefusals(card, where, catalog) : [];
};

// A card kept is the first card on the screen with its title that no card before it kept.
const keptFrom = (cards: readonly Card[], open: readonly OpenCard[]): (OpenCard | undefined)[] => {
  const taken = new Set<number>();
  return cards.map((card) => {
    const at = card.keep === undefined ? -1 : open.findIndex((candidate, index) => candidate.title === card.keep && !taken.has(index));
    if (at < 0) return undefined;
    taken.add(at);
    return open[at];
  });
};

const keepRefusal = (title: string, where: string, open: readonly OpenCard[]): string => {
  if (open.length === 0) return `${where}: an answer asked on the first screen starts from an empty screen; nothing on it can be kept.`;
  if (open.some((card) => card.title === title)) return `${where}: the card "${title}" is kept already; a card is kept once.`;
  return `${where}: there is no card "${title}" on the screen; its cards are ${open.map((card) => `"${card.title}"`).join(', ')}.`;
};

const canvasOf = (card: Card, kept: OpenCard | undefined, catalog: Catalog): Canvas | undefined => {
  if (kept !== undefined) return { action: kept.action, input: kept.input, intent: kept.intent };
  if (card.say !== undefined) return wordsCanvas(card.say);
  if (card.action === undefined) return undefined;
  const intent = card.intent?.trim() ?? '';
  return opened({ action: card.action, input: card.input ?? {}, intent: intent !== '' ? intent : (catalog.actions.find((action) => action.id === card.action)?.description ?? '') }, catalog);
};

// The cards in reading order, each in the area of its place: the first in `a`, the next in `b`.
const placed = (cards: readonly Card[], open: readonly OpenCard[], catalog: Catalog): AreaCanvases => {
  const kept = keptFrom(cards, open);
  return Object.fromEntries(
    cards.flatMap((card, at) => {
      const area = AREAS[at];
      const canvas = canvasOf(card, kept[at], catalog);
      return area === undefined || canvas === undefined ? [] : [[area, canvas]];
    }),
  );
};

const standing = (open: readonly OpenCard[]): AreaCanvases => Object.fromEntries(open.map(({ area, action, input, intent }) => [area, { action, input, intent }]));

const layoutOf = (spans: readonly { at: number; span?: number }[], columns: number): WrittenLayout =>
  gridLayout({
    columns,
    areas: spans.flatMap(({ at, span }) => {
      const name = AREAS[at];
      return name === undefined ? [] : [{ name, span }];
    }),
  });

export const refusalsOf = (reply: Reply, context: AnswerContext): string[] => {
  const { open, catalog, screens } = context;
  if (reply.screen) return screens.some((screen) => screen.id === reply.screen) ? [] : [`"${reply.screen}" is not one of the app's screens.`];
  const cards = cardsOf(reply);
  const kept = keptFrom(cards, open);
  const refusals = cards.flatMap((card, at) => {
    const own = cardRefusals(card, `cards[${at}]`, catalog);
    return own.length === 0 && card.keep !== undefined && kept[at] === undefined ? [keepRefusal(card.keep, `cards[${at}]`, open)] : own;
  });
  const shown = new Map<string, number>();
  cards.forEach((card, at) => {
    const canvas = canvasOf(card, kept[at], catalog);
    if (canvas === undefined) return;
    const key = JSON.stringify([canvas.action, canvas.input]);
    const there = shown.get(key);
    if (there !== undefined) refusals.push(`cards[${there}] and cards[${at}] would show the same thing; show it once.`);
    else shown.set(key, at);
  });
  return refusals;
};

export const answerOf = (reply: Reply, context: AnswerContext): Answer => {
  const title = reply.title.trim();
  if (reply.screen) return { title, screen: reply.screen, canvases: {} };
  const cards = cardsOf(reply);
  if (cards.length === 0) return { title, canvases: standing(context.open) };
  return { title, canvases: placed(cards, context.open, context.catalog), layout: layoutOf(cards.map((card, at) => ({ at, ...(card.span === undefined ? {} : { span: card.span }) })), reply.columns ?? context.columns) };
};

// While the reply streams, solid writes it left to right: a card is finished once the next one has begun, or once the
// reply has gone past the cards to `screen` (solid holds every key from the start; a key the model has reached has a
// value, null included). The cards finished take their places, and a place after them holds what it held, unless that
// card was kept into an earlier place; a card that does not hold stops what is placed. The whole reply is the run's to
// check when it ends.
export const answerSoFar = (output: unknown, context: AnswerContext): Answer | undefined => {
  const data = recordOf(recordOf(output)['data']);
  const written = data['cards'];
  if (!Array.isArray(written) || typeof data['screen'] === 'string') return undefined;
  const cards: Card[] = [];
  for (const raw of data['screen'] === undefined ? written.slice(0, -1) : written) {
    const parsed = CardSchema.safeParse(raw);
    if (!parsed.success) break;
    const card = cardOf(parsed.data);
    if (cardRefusals(card, '', context.catalog).length > 0 || (card.keep !== undefined && keptFrom([...cards, card], context.open).at(-1) === undefined)) break;
    cards.push(card);
  }
  if (cards.length === 0) return undefined;
  const kept = new Set(keptFrom(cards, context.open));
  const rest = context.open.flatMap((card, at) => (at >= cards.length && !kept.has(card) ? [{ at, card }] : []));
  const asked = data['columns'];
  const columns = typeof asked === 'number' && Number.isInteger(asked) && asked >= 1 && asked <= 3 ? asked : context.columns;
  const canvases: AreaCanvases = { ...placed(cards, context.open, context.catalog) };
  for (const { at, card } of rest) {
    const area = AREAS[at];
    if (area !== undefined) canvases[area] = { action: card.action, input: card.input, intent: card.intent };
  }
  const spans = [...cards.map((card, at) => ({ at, ...(card.span === undefined ? {} : { span: card.span }) })), ...rest.map(({ at, card }) => ({ at, span: card.span }))];
  const title = typeof data['title'] === 'string' ? data['title'].trim() : '';
  return { title, canvases, layout: layoutOf(spans, columns) };
};
