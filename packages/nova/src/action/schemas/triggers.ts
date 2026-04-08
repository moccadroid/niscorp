import { z } from 'zod';
import { StepSchema } from './effects';

export const TriggerConfigSchema = z
  .object({
    event: z.string().optional().describe('UI event type to listen for, e.g. "ui:click".'),
    message: z.string().optional().describe('Message bus channel name to listen on.'),
    ref: z.string().optional().describe('Component ref to filter events by.'),
    do: z.array(StepSchema).describe('Ordered steps to execute when the trigger fires.'),
  })
  .strict()
  .refine((trigger) => trigger.event !== undefined || trigger.message !== undefined, {
    message: 'A trigger must specify either "event" or "message".',
  })
  .describe('Binds an event or message source to an ordered sequence of steps.');

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;
