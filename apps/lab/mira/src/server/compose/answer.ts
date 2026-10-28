import { CARDS_ON_A_SCREEN } from '../../app/screens';
import { opened } from './catalog';
import type { Catalog } from './catalog';
import type { ComposerDeps } from './knowledge';
import { wordsInput } from './plan';
import type { Placed } from './plan';
import { recordOf } from './record';
import { CardSchema, cardOf, cardsOf } from './reply.schema';
import type { Card, Reply } from './reply.schema';
import type { OpenCard } from './screen';

// No cards keep the screen as it is.
export type Answer = { title: string; screen?: string; cards: Placed[]; columns: number };

// `open`: the cards on the screen now an answer may keep, in reading order; `columns`: how many it is laid out in;
// `fresh`: the key a card this answer opens takes, by its place, the same while the answer streams and when it ends.
export type AnswerContext = ComposerDeps & { open: readonly OpenCard[]; columns: number; fresh: readonly string[] };

const actionRefusals = (card: Card, where: string, catalog: Catalog): string[] => {
  const action = catalog.actions.find((candidate) => candidate.id === card.action);
  if (action === undefined) return [`${where}: there is no action "${String(card.action)}".`];
  const parsed = action.check.safeParse(card.input ?? {});
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${where}: input.${issue.path.join('.')}: ${issue.message}`);
};

const cardRefusals = (card: Card, where: string, catalog: Catalog): string[] => {
  const kinds = [card.keep !== undefined, card.action !== undefined || card.input !== undefined, card.say !== undefined].filter(Boolean).length;
  if (kinds !== 1) return [`${where}: give exactly one of "keep", "action" with "input", or "say".`];
  return card.keep === undefined && card.say === undefined ? actionRefusals(card, where, catalog) : [];
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

// The cards in reading order. A card kept is the card it keeps, its key and all; so is a card given exactly as one on the
// screen is, the same action with the same input. A card opened where the screen has a card of the same action that no
// card is yet is that card written again, under its key; any other takes the fresh key of its place.
const placed = (cards: readonly Card[], context: AnswerContext): Placed[] => {
  const { open, catalog, fresh } = context;
  const kept = keptFrom(cards, open);
  const taken = new Set(kept.flatMap((card) => (card === undefined ? [] : [card.key])));
  const written = cards.map((card, at) => {
    if (kept[at] !== undefined) return undefined;
    if (card.say !== undefined) return { action: 'answer.text', input: wordsInput(card.say) };
    return card.action === undefined ? undefined : opened({ action: card.action, input: card.input ?? {} }, catalog);
  });
  const same = written.map((card) => {
    const match = card === undefined ? undefined : open.find((candidate) => !taken.has(candidate.key) && candidate.action === card.action && JSON.stringify(candidate.input) === JSON.stringify(card.input));
    if (match !== undefined) taken.add(match.key);
    return match;
  });
  return cards.flatMap((card, at): Placed[] => {
    const keeps = kept[at];
    if (keeps !== undefined) return [{ key: keeps.key, action: keeps.action, input: keeps.input, span: card.span ?? keeps.span }];
    const given = written[at];
    if (given === undefined) return [];
    const there = same[at] ?? open[at];
    const again = there !== undefined && there.action === given.action && (same[at] !== undefined || !taken.has(there.key));
    if (again) taken.add(there.key);
    return [{ key: again ? there.key : (fresh[at] ?? ''), ...given, span: card.span ?? 1 }];
  });
};

export const refusalsOf = (reply: Reply, context: AnswerContext): string[] => {
  const { open, catalog, screens } = context;
  if (reply.screen) return screens.some((screen) => screen.id === reply.screen) ? [] : [`"${reply.screen}" is not one of the app's screens.`];
  const cards = cardsOf(reply);
  const kept = keptFrom(cards, open);
  const refusals = cards.flatMap((card, at) => {
    const own = cardRefusals(card, `cards[${at}]`, catalog);
    return own.length === 0 && card.keep !== undefined && kept[at] === undefined ? [keepRefusal(card.keep, `cards[${at}]`, open)] : own;
  });
  if (refusals.length > 0) return refusals;
  const shown = new Map<string, number>();
  placed(cards, context).forEach((card, at) => {
    const same = JSON.stringify([card.action, card.input]);
    const there = shown.get(same);
    if (there !== undefined) refusals.push(`cards[${there}] and cards[${at}] would show the same thing; show it once.`);
    else shown.set(same, at);
  });
  return refusals;
};

const standing = (open: readonly OpenCard[]): Placed[] => open.map(({ key, action, input, span }) => ({ key, action, input, span }));

export const answerOf = (reply: Reply, context: AnswerContext): Answer => {
  const title = reply.title.trim();
  if (reply.screen) return { title, screen: reply.screen, cards: [], columns: context.columns };
  const cards = cardsOf(reply);
  if (cards.length === 0) return { title, cards: standing(context.open), columns: context.columns };
  return { title, cards: placed(cards, context), columns: reply.columns ?? context.columns };
};

// While the reply streams, solid writes it left to right: a card is finished once the next one has begun, or once the
// reply has gone past the cards to `screen` (solid holds every key from the start; a key the model has reached has a
// value, null included). The cards finished take their places, and every card on the screen they have not kept or
// written into stays after them, in its order, so a card kept later is never closed on the way; a card that does not hold
// stops what is placed. The whole reply is the run's to check when it ends.
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
  const placedSoFar = placed(cards, context);
  const rest = standing(context.open.filter((card) => !placedSoFar.some((one) => one.key === card.key)));
  const asked = data['columns'];
  const columns = typeof asked === 'number' && Number.isInteger(asked) && asked >= 1 && asked <= 3 ? asked : context.columns;
  const title = typeof data['title'] === 'string' ? data['title'].trim() : '';
  return { title, cards: [...placedSoFar, ...rest].slice(0, CARDS_ON_A_SCREEN), columns };
};
