import { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// NovaEvent — the built-in discriminated union of UI events.
// Consumers may supply their own union to createEventBus<T>.
// ═══════════════════════════════════════════════════════════

const UiClickSchema = z
  .object({
    type: z.literal('ui:click').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref.'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A UI click event.');

const UiSubmitSchema = z
  .object({
    type: z.literal('ui:submit').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref.'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A UI submit event.');

const UiInputSchema = z
  .object({
    type: z.literal('ui:input').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref.'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A UI input event.');

const UiFocusSchema = z
  .object({
    type: z.literal('ui:focus').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref.'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A UI focus event.');

const UiBlurSchema = z
  .object({
    type: z.literal('ui:blur').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref.'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A UI blur event.');

const UiModelSchema = z
  .object({
    type: z.literal('ui:model').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref.'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A two-way-bound model update event.');

export const NovaEventSchema = z
  .discriminatedUnion('type', [
    UiClickSchema,
    UiSubmitSchema,
    UiInputSchema,
    UiFocusSchema,
    UiBlurSchema,
    UiModelSchema,
  ])
  .describe('Discriminated union of the built-in Nova UI events.');

export type NovaEvent = z.infer<typeof NovaEventSchema>;
