import { z } from 'zod';
import { CARDS_ON_A_SCREEN } from '../../app/screens';

export const CardSchema = z
  .object({
    keep: z.string().nullish().describe('Keeps a card on the screen now: its title. With an input too, that card is written into with it.'),
    action: z.string().nullish().describe('Opens a card: the id of one of the ACTIONS.'),
    input: z
      .record(z.string(), z.unknown())
      .nullish()
      .describe("What the card is opened with, as its action's input schema says; a form's fields carry what the message gives for them."),
    span: z.number().int().min(1).max(3).nullish().describe('How many of the columns it takes; one when left out.'),
  })
  .strict()
  .describe('One card of the screen after the answer: a card on the screen now, kept as it is or written into, or an action opened with its input.');

const ColumnsSchema = z.number().int().min(1).max(3).nullish().describe('How many columns the cards are laid out in; as on the screen now when left out.');

export const ReplySchema = z
  .object({
    title: z.string().max(40).describe('What the answer is, in at most four words ("The charter", "How reads work"), never the message repeated. It names the answer among the others.'),
    columns: ColumnsSchema,
    cards: z
      .array(CardSchema)
      .max(CARDS_ON_A_SCREEN)
      .nullish()
      .describe('The screen after the answer: every card on it, kept or new, in reading order, row by row. Left out or empty, the screen stays as it is.'),
    screen: z.string().nullish().describe('The id of one of the SCREENS, only when the message asks for that screen as it is; then no cards.'),
  })
  .strict();

export type Reply = z.infer<typeof ReplySchema>;

// What `place` puts on the screen: the screen after it, as a reply's cards are.
export const ScreenSchema = z
  .object({
    columns: ColumnsSchema,
    cards: z.array(CardSchema).min(1).max(CARDS_ON_A_SCREEN).describe('Every card on the screen after it, kept or new, in reading order, row by row.'),
  })
  .strict();

export type Screen = z.infer<typeof ScreenSchema>;

export type Card = { keep?: string; action?: string; input?: Record<string, unknown>; span?: number };

export const cardOf = ({ keep, action, input, span }: z.infer<typeof CardSchema>): Card => ({
  ...(keep ? { keep: keep.trim() } : {}),
  ...(action ? { action } : {}),
  ...(input ? { input } : {}),
  ...(span ? { span } : {}),
});

export const cardsOf = (reply: Reply): Card[] => (reply.cards ?? []).map(cardOf);
