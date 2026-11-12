import { z } from 'zod';
import type { Card } from '../../app/screens';
import { opened } from './catalog';
import type { Catalog } from './catalog';

// One turn, as the model writes it: the cards under its sentence. The sentence itself is cortex's envelope's `response`.
export const CardSchema = z
  .object({
    action: z.string().nullish().describe('Shows a card: the id of one of the CARDS.'),
    input: z.record(z.string(), z.unknown()).nullish().describe('What the card is opened with, as its input schema says: what the person asked for, filled in.'),
    say: z
      .object({
        title: z.string().max(60).describe('A few words.'),
        text: z.string().max(240).describe('At most two short sentences.'),
      })
      .strict()
      .nullish()
      .describe('Words, as a card: only for what no card shows.'),
  })
  .strict()
  .describe('One card: exactly one of action with input, or say.');

export const TurnSchema = z
  .object({
    cards: z.array(CardSchema).max(3).nullish().describe('Up to three cards under your sentence that show the answer, the most important first; none when the sentence says it all.'),
  })
  .strict();

export type Turn = z.infer<typeof TurnSchema>;

export const turnRefusals = (turn: Turn, catalog: Catalog): string[] => {
  const seen = new Set<string>();
  return (turn.cards ?? []).flatMap((card, at) => {
    const where = `cards[${String(at)}]`;
    const isAction = card.action !== undefined && card.action !== null;
    const isSay = card.say !== undefined && card.say !== null;
    if (isAction === isSay) return [`${where}: give exactly one of "action" with "input", or "say".`];
    if (!isAction) return [];
    const same = JSON.stringify([card.action, card.input ?? {}]);
    if (seen.has(same)) return [`${where}: shows the same as an earlier card; show it once.`];
    seen.add(same);
    const known = catalog.actions.find((candidate) => candidate.id === card.action);
    if (known === undefined) return [`${where}: there is no card "${String(card.action)}".`];
    const parsed = known.check.safeParse(card.input ?? {});
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${where}: input.${issue.path.join('.')}: ${issue.message}`);
  });
};

// The cards as they are placed: words as the words card, any other as itself, opened with its whole input.
export const cardsOf = (turn: Turn, catalog: Catalog): Card[] =>
  (turn.cards ?? []).flatMap((card): Card[] => {
    if (card.say) return [{ action: 'answer.text', input: { title: card.say.title.trim(), text: card.say.text.trim() } }];
    if (!card.action) return [];
    return [opened({ action: card.action, input: card.input ?? {} }, catalog)];
  });
