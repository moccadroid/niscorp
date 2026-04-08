import { z } from 'zod';
import { MutationSchema } from '../mutations';
import type { Mutation } from '../mutations';

// ═══════════════════════════════════════════════════════════
// Effects + Steps (recursive union of Mutation | Effect)
// ═══════════════════════════════════════════════════════════

export type Step = Mutation | Effect;

export type CallEffect = {
  call: string;
  onSuccess?: Step[];
  onError?: Step[];
};

export type EmitEffect = {
  emit: { channel: string; payload?: unknown };
};

export type PushEffect = {
  push: { action: string; canvas?: string; input?: Record<string, unknown> };
};

export type PopEffect = { pop: true };

export type ReplaceEffect = {
  replace: { action: string; canvas?: string; input?: Record<string, unknown> };
};

export type Effect = CallEffect | EmitEffect | PushEffect | PopEffect | ReplaceEffect;

export const StepSchema: z.ZodType<Step> = z.lazy(() =>
  z.union([MutationSchema, EffectSchema]).describe('A step is either a mutation or an effect.'),
);

const CallEffectSchema: z.ZodType<CallEffect> = z.lazy(() =>
  z
    .object({
      call: z.string().describe('Name of the endpoint to invoke.'),
      onSuccess: z.array(StepSchema).optional().describe('Steps to run after a successful response.'),
      onError: z
        .array(StepSchema)
        .optional()
        .describe('Steps to run after an error response (with @error scope available).'),
    })
    .strict()
    .describe('Invoke a named endpoint with optional success/error step branches.'),
);

const EmitEffectSchema = z
  .object({
    emit: z
      .object({
        channel: z.string().describe('Channel name to publish on.'),
        payload: z
          .unknown()
          .optional()
          .describe('Payload to publish; templates are resolved against the current data.'),
      })
      .strict()
      .describe('Channel + payload to publish.'),
  })
  .strict()
  .describe('Publish a payload to a message channel.');

const PushEffectSchema = z
  .object({
    push: z
      .object({
        action: z.string().describe('Definition id of the action to push onto a canvas.'),
        canvas: z.string().optional().describe('Canvas id to push onto; defaults to the current canvas.'),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Initial input merged into the new action data.'),
      })
      .strict()
      .describe('Push parameters.'),
  })
  .strict()
  .describe('Push a new action onto a canvas (escapes via onNavigate callback).');

const PopEffectSchema = z
  .object({
    pop: z.literal(true).describe('Sentinel literal — must be true.'),
  })
  .strict()
  .describe('Pop the current action (escapes via onNavigate callback).');

const ReplaceEffectSchema = z
  .object({
    replace: z
      .object({
        action: z.string().describe('Definition id of the replacement action.'),
        canvas: z
          .string()
          .optional()
          .describe('Canvas id to replace on; defaults to the current canvas.'),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Initial input merged into the new action data.'),
      })
      .strict()
      .describe('Replace parameters.'),
  })
  .strict()
  .describe('Replace the current action (escapes via onNavigate callback).');

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z
    .union([CallEffectSchema, EmitEffectSchema, PushEffectSchema, PopEffectSchema, ReplaceEffectSchema])
    .describe('An effect that touches the outside world.'),
);
