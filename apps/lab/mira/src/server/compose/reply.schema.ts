import { z } from 'zod';
import { CARDS_ON_A_SCREEN } from '../../app/screens';
import type { Catalog } from './catalog';
import { recordOf } from './record';

export type Reply = { title: string; columns?: number | null | undefined; cards?: Record<string, unknown>[] | null | undefined; screen?: string | null | undefined };

export type Card = { keep?: string; action?: string; input?: Record<string, unknown>; span?: number };

const span = z.number().int().min(1).max(3).nullish().describe('How many columns wide this card is: 1 to 3. Default 1.');

// The reply to one message: the cards it can keep are the ones on the screen, the cards it can add are the actions,
// each with its own input schema, and the screens it can open are the app's.
export const replySchemaFor = (catalog: Catalog, titles: readonly string[], screens: readonly string[]): { reply: z.ZodType<Reply>; card: z.ZodType<Record<string, unknown>> } => {
  const added = catalog.actions.map((action) =>
    z
      .object({
        action: z.literal(action.id).describe('The card to add: its id in ACTIONS.'),
        input: action.check.describe('Its input, as its schema in ACTIONS says.'),
        span,
      })
      .strict(),
  );
  const [firstTitle, ...moreTitles] = titles;
  const kept =
    firstTitle === undefined
      ? []
      : [
          z
            .object({
              keep: z.enum([firstTitle, ...moreTitles]).describe('The title of a card on THE SCREEN, to keep that card.'),
              input: z.record(z.string(), z.unknown()).nullish().describe('New input for that card, only when the message changes what it holds.'),
              span,
            })
            .strict(),
        ];
  const [only, second, ...rest] = [...kept, ...added];
  if (only === undefined) throw new Error('mira: a reply needs at least one action it can add.');
  const card = (second === undefined ? only : z.union([only, second, ...rest])).describe('A card: one kept from THE SCREEN, or one added from ACTIONS.');
  const [firstScreen, ...moreScreens] = screens;
  const screen = (firstScreen === undefined ? z.never() : z.enum([firstScreen, ...moreScreens])).nullish().describe('Open one of the SCREENS as it is, instead of giving cards.');
  const reply = z
    .object({
      title: z.string().max(40).describe('A short name for this answer, two to four words. It names the answer in the dock and the overview.'),
      columns: z.number().int().min(1).max(3).nullish().describe('How many columns the cards are in: 1, 2 or 3. Leave it out to keep the columns THE SCREEN has.'),
      cards: z.array(card).max(CARDS_ON_A_SCREEN).nullish().describe('Every card on the screen after your answer, in reading order. Leave it out to keep THE SCREEN as it is.'),
      screen,
    })
    .strict();
  return { reply, card };
};

export const cardOf = (raw: unknown): Card => {
  const { keep, action, input, span: wide } = recordOf(raw);
  return {
    ...(typeof keep === 'string' && keep.trim() !== '' ? { keep: keep.trim() } : {}),
    ...(typeof action === 'string' && action !== '' ? { action } : {}),
    ...(input !== null && typeof input === 'object' && !Array.isArray(input) ? { input: recordOf(input) } : {}),
    ...(typeof wide === 'number' ? { span: wide } : {}),
  };
};

export const cardsOf = (reply: Reply): Card[] => (reply.cards ?? []).map(cardOf);
