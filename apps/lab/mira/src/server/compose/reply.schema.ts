import { z } from 'zod';
import { AREAS } from '../../app/shell/areas';
import type { Said } from './plan';

export const CardSchema = z
  .object({
    keep: z.string().nullish().describe('Keeps a card on the screen now as it is: its title.'),
    action: z.string().nullish().describe('Opens a card: the id of one of the ACTIONS.'),
    input: z
      .record(z.string(), z.unknown())
      .nullish()
      .describe("What the card is opened with, as its action's input schema says; a form's fields carry what the message gives for them."),
    intent: z.string().nullish().describe('Why the card is there, in a few words.'),
    say: z
      .object({ title: z.string().max(60).describe('A few words.'), text: z.string().max(1000).describe('What there is to read: a few sentences, or a line for each step or item.') })
      .strict()
      .nullish()
      .describe('A card of words: what you have to say — an answer, an explanation, steps, a list — where no screen or action shows it.'),
    span: z.number().int().min(1).max(3).nullish().describe('How many of the columns it takes; one when left out.'),
  })
  .strict()
  .describe('One card of the screen after the answer: exactly one of keep, action with input and intent, or say.');

export const ReplySchema = z
  .object({
    title: z.string().max(40).describe('What the answer is, in at most four words ("The charter", "How reads work"), never the message repeated. It names the answer among the others.'),
    columns: z.number().int().min(1).max(3).nullish().describe('How many columns the cards are laid out in; as on the screen now when left out.'),
    cards: z
      .array(CardSchema)
      .max(AREAS.length)
      .nullish()
      .describe('The screen after the answer: every card on it, kept or new, in reading order, row by row. Left out or empty, the screen stays as it is.'),
    screen: z.string().nullish().describe('The id of one of the SCREENS, only when the message asks for that screen as it is; then no cards.'),
  })
  .strict();

export type Reply = z.infer<typeof ReplySchema>;

export type Card = { keep?: string; action?: string; input?: Record<string, unknown>; intent?: string; say?: Said; span?: number };

export const cardOf = ({ keep, action, input, intent, say, span }: z.infer<typeof CardSchema>): Card => ({
  ...(keep ? { keep: keep.trim() } : {}),
  ...(action ? { action } : {}),
  ...(input ? { input } : {}),
  ...(intent ? { intent } : {}),
  ...(say ? { say: { title: say.title.trim(), text: say.text.trim() } } : {}),
  ...(span ? { span } : {}),
});

export const cardsOf = (reply: Reply): Card[] => (reply.cards ?? []).map(cardOf);
