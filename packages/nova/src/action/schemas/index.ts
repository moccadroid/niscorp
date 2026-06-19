import { z } from 'zod';
import { LayoutNodeSchema } from '@layout/schemas';
import { MutationSchema } from '../mutations';
import { EndpointConfigSchema } from './endpoints';
import { LifecycleConfigSchema } from './lifecycle';
import { TriggerConfigSchema } from './triggers';

// ═══════════════════════════════════════════════════════════
// Action Definition — composes all sibling schemas.
// ═══════════════════════════════════════════════════════════

export const ActionDefinitionSchema = z
  .object({
    id: z.string().describe('Stable definition id.'),
    name: z.string().optional().describe('Human-readable name.'),
    description: z.string().optional().describe('Free-form description.'),
    layout: z
      .union([z.string(), LayoutNodeSchema])
      .optional()
      .describe('Either a layout id stored in the layout store, or an inline LayoutNode.'),
    data: z.record(z.string(), z.unknown()).optional().describe('Static default data merged with input on mount.'),
    triggers: z.array(TriggerConfigSchema).optional().describe('Event/message triggers.'),
    endpoints: z
      .record(z.string(), EndpointConfigSchema)
      .optional()
      .describe('Named endpoints — HTTP calls or local functions.'),
    lifecycle: LifecycleConfigSchema.optional().describe('Lifecycle hooks.'),
  })
  .strict()
  .describe('Definition of an action: layout + data + behavior.');

export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

// ═══════════════════════════════════════════════════════════
// Action Fragment — a reusable PARTIAL action (every field optional) that is
// MERGED into a concrete action at a push/replace `with`, producing the
// effective ActionDefinition that gets instantiated. This is composition, not
// inheritance: `Action + ActionFragment ⇒ Action`. A fragment is abstract — it
// only exists merged, lives in its own registry, and cannot be pushed as an
// action on its own. Its `layout` is the chrome that WRAPS the action; a
// `{ slot: 'body' }` node in it is filled with the composing action's layout.
// On merge: the action's layout fills the slot; data/endpoints deep-merge with
// the action winning; triggers and per-hook lifecycle steps concatenate
// (fragment first). See `composeAction`.
// ═══════════════════════════════════════════════════════════

export const ActionFragmentSchema = z
  .object({
    kind: z.literal('fragment').describe('Discriminator — marks this as an abstract, merge-only fragment.'),
    id: z.string().describe('Stable fragment id, referenced from a push/replace `with: [...]`.'),
    name: z.string().optional().describe('Human-readable name.'),
    description: z.string().optional().describe('Free-form description.'),
    layout: z
      .union([z.string(), LayoutNodeSchema])
      .optional()
      .describe('The wrapping (chrome) layout, or a layout id. Put a `{ slot: "body" }` node where the composing action\'s own layout is dropped in.'),
    data: z.record(z.string(), z.unknown()).optional().describe('Partial default data; deep-merged under the action (the action wins on conflict).'),
    triggers: z.array(TriggerConfigSchema).optional().describe('Pre-wired triggers (e.g. a modal\'s close/cancel). Concatenated before the action\'s triggers.'),
    endpoints: z
      .record(z.string(), EndpointConfigSchema)
      .optional()
      .describe('Named endpoints, merged under the action (the action wins on a name clash).'),
    lifecycle: LifecycleConfigSchema.optional().describe('Lifecycle hooks; per-hook steps run before the action\'s.'),
  })
  .strict()
  .describe('A reusable partial action — layout + wired behavior — merged into a concrete action at a push `with`. Abstract: only exists merged, never instantiated alone.');

export type ActionFragment = z.infer<typeof ActionFragmentSchema>;

// Re-export mutations schema (for backwards-compatible imports within action/)
export { MutationSchema };
export type { Mutation } from '../mutations';

// Re-export sibling schemas + inferred types
export { EffectSchema, StepSchema } from './effects';
export type { Effect, Step, CallEffect, EmitEffect, PushEffect, PopEffect, ReplaceEffect } from './effects';
export { TriggerConfigSchema } from './triggers';
export type { TriggerConfig } from './triggers';
export { EndpointConfigSchema } from './endpoints';
export type { EndpointConfig, HttpEndpointConfig, FunctionEndpointConfig } from './endpoints';
export { LifecycleConfigSchema } from './lifecycle';
export type { LifecycleConfig } from './lifecycle';
