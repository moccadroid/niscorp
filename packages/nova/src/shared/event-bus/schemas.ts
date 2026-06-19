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

const UiKeySchema = z
  .object({
    type: z.literal('ui:key').describe('Event type discriminator.'),
    key: z.string().describe('The key pressed, e.g. "ArrowDown", "Enter", "Escape".'),
    ref: z.string().optional().describe('Target component ref (scope the key to a component).'),
    payload: z.unknown().optional().describe('Optional event payload.'),
  })
  .strict()
  .describe('A keyboard key event. A trigger filters it by `key` (and optionally `ref`).');

const UiDropSchema = z
  .object({
    type: z.literal('ui:drop').describe('Event type discriminator.'),
    ref: z.string().optional().describe('Target component ref (the drop zone).'),
    payload: z.unknown().optional().describe('Optional event payload, e.g. { id, toStage }.'),
  })
  .strict()
  .describe('A drag-and-drop "drop" event — the semantic outcome of a drag gesture, dispatched by a drop zone. The gesture mechanics stay in the component; only the drop reaches Nova.');

export const NovaEventSchema = z
  .discriminatedUnion('type', [
    UiClickSchema,
    UiSubmitSchema,
    UiInputSchema,
    UiFocusSchema,
    UiBlurSchema,
    UiModelSchema,
    UiKeySchema,
    UiDropSchema,
  ])
  .describe('Discriminated union of the built-in Nova UI events.');

export type NovaEvent = z.infer<typeof NovaEventSchema>;
