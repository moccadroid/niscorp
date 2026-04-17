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
