import { z } from 'zod';

const uiEvent = <T extends string, E extends z.ZodRawShape = Record<never, never>>(
  type: T,
  extra: E = {} as E,
) =>
  z
    .object({
      type: z.literal(type).describe('Event type discriminator.'),
      ref: z.string().optional().describe('Target component ref.'),
      payload: z.unknown().optional().describe('Optional event payload.'),
      origin: z
        .string()
        .optional()
        .describe(
          'Id of the action instance that dispatched this event. Stamped automatically for events dispatched from within an instance’s layout; used to deliver UI events to that instance’s own triggers only. Absent on programmatic (global) dispatch.',
        ),
      ...extra,
    })
    .strict();

const UiClickSchema = uiEvent('ui:click').describe('A UI click event.');
const UiSubmitSchema = uiEvent('ui:submit').describe('A UI submit event.');
const UiInputSchema = uiEvent('ui:input').describe('A UI input event.');
const UiFocusSchema = uiEvent('ui:focus').describe('A UI focus event.');
const UiBlurSchema = uiEvent('ui:blur').describe('A UI blur event.');
const UiModelSchema = uiEvent('ui:model').describe('A two-way-bound model update event.');
const UiKeySchema = uiEvent('ui:key', {
  key: z.string().describe('The key pressed, e.g. "ArrowDown", "Enter", "Escape".'),
}).describe('A keyboard key event. A trigger filters it by `key` (and optionally `ref`).');
const UiDropSchema = uiEvent('ui:drop').describe(
  'A drag-and-drop "drop" event — the semantic outcome of a drag gesture, dispatched by a drop zone. The gesture mechanics stay in the component; only the drop reaches Nova.',
);

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
