import { z } from 'zod';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { AreaIdSchema } from './layout';
import type { Said } from './plan';

const GridSchema = z
  .object({
    columns: z.number().int().min(1).max(3).describe('How many columns the areas are laid out in.'),
    areas: z
      .array(
        z
          .object({
            name: AreaIdSchema.describe('An area the answer uses.'),
            span: z.number().int().min(1).max(3).nullish().describe('How many of the columns it takes; one when left out.'),
          })
          .strict(),
      )
      .min(1)
      .max(AREAS.length)
      .describe('The areas the answer uses, in the order they are drawn, row by row.'),
  })
  .strict()
  .describe('A layout of your own, only when no arrangement suits, or the message says where things go and no arrangement puts them there.');

const EntrySchema = z
  .object({
    area: AreaIdSchema.describe('The area this entry is for.'),
    keep: AreaIdSchema.nullish().describe('Moves the canvas now in that area here, unchanged. That area is then empty, unless another entry gives it something.'),
    action: z.string().nullish().describe('Puts a canvas here: the id of one of the ACTIONS.'),
    input: z
      .record(z.string(), z.unknown())
      .nullish()
      .describe("What the canvas is opened with, as its action's input schema says. A read's params carry every value it is asked with; a form's fields carry what the message gives for them."),
    intent: z.string().nullish().describe('Why the canvas is there, in a few words.'),
    say: z
      .object({ title: z.string().max(60).describe('A few words.'), text: z.string().max(240).describe('At most two short sentences.') })
      .strict()
      .nullish()
      .describe('Puts words here: only when the message asks about this app itself, or for something no action shows.'),
    drop: z.boolean().nullish().describe('Empties this area.'),
  })
  .strict()
  .describe('What one area holds after the answer: exactly one of keep, action with input and intent, say, or drop.');

// `reasoning` and `title` come first, so the model says what it will do before it writes the areas.
export const ReplySchema = z
  .object({
    reasoning: z
      .string()
      .max(120)
      .describe('One plain sentence for the person, at most 120 characters: what you change and why, or why nothing changes. Name what they see, never area letters, arrangement names or fingerprints.'),
    title: z.string().max(40).describe('What the answer is, in at most four words ("German greetings", "A joke"), never the message repeated. It names the answer among the others.'),
    areas: z.array(EntrySchema).max(AREAS.length).nullish().describe('An entry for each area that changes. An area left out stays as it is, unless the arrangement has no such area.'),
    arrangement: z.string().nullish().describe('The id of one of the ARRANGEMENTS, only when the answer needs other room than the one on screen; every area used must be in it.'),
    grid: GridSchema.nullish(),
    screen: z.string().nullish().describe('The id of one of the SCREENS, only when the message asks for that screen as it is; then no areas.'),
  })
  .strict();

export type Reply = z.infer<typeof ReplySchema>;

export type Entry = { area: AreaId; keep?: AreaId; action?: string; input?: Record<string, unknown>; intent?: string; say?: Said; drop: boolean };

export const entriesOf = (reply: Reply): Entry[] =>
  (reply.areas ?? []).map(({ area, keep, action, input, intent, say, drop }) => ({
    area,
    ...(keep ? { keep } : {}),
    ...(action ? { action } : {}),
    ...(input ? { input } : {}),
    ...(intent ? { intent } : {}),
    ...(say ? { say: { title: say.title.trim(), text: say.text.trim() } } : {}),
    drop: drop === true,
  }));
