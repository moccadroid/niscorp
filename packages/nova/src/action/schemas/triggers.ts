import { z } from 'zod';
import { StepSchema } from './effects';

export const TriggerConfigSchema = z
  .object({
    event: z
      .string()
      .optional()
      .describe('UI event type to listen for: "ui:click" (activations, incl. table rows), "ui:model" (an input\'s value changed), "ui:key".'),
    message: z.string().optional().describe('Message bus channel name to listen on (fired by an `emit` step, possibly from another action).'),
    ref: z
      .string()
      .optional()
      .describe('Component ref to filter events by — MUST match a `ref` carried by a node in this action\'s layout; a trigger on a ref no layout node carries never fires.'),
    key: z.string().optional().describe('Key to filter "ui:key" events by, e.g. "ArrowDown".'),
    do: z
      .array(StepSchema)
      .describe('Ordered steps to execute when the trigger fires. Steps may reference the firing event as "@event" — "@event.payload" is the fired value (a table row click: the row\'s clickKey/rowKey field; an input\'s ui:model: the typed text).'),
  })
  .strict()
  .refine((trigger) => trigger.event !== undefined || trigger.message !== undefined, {
    message: 'A trigger must specify either "event" or "message".',
  })
  .describe('Binds an event or message source to an ordered sequence of steps.');

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;
