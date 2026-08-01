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
  push: { action: string; canvas?: string; input?: Record<string, unknown>; with?: string[] };
};

export type PopEffect = { pop: true };

export type ReplaceEffect = {
  replace: { action: string; canvas?: string; input?: Record<string, unknown>; with?: string[] };
};

// Pop a canvas down to a given instance (everything above it is popped). The
// stack-nav breadcrumb fires this with the target crumb's instance id.
export type PopToEffect = { popTo: { canvas?: string; instance: string } };

// Reset a canvas to a single root action (clear the whole stack, then push). The
// screen-level nav (sidebar) fires this so drilling into a record doesn't leave
// a stale stack beneath the new screen.
export type ResetToEffect = {
  resetTo: { action: string; canvas?: string; input?: Record<string, unknown>; with?: string[] };
};

// Remove ONE instance anywhere in a canvas's stack (not just the top). On a
// list-mode canvas — where every card is live and visible at once — this is how
// a card's own close button dismisses itself. `pop` removes the top; this
// removes a named one.
export type RemoveInstanceEffect = { removeInstance: { canvas?: string; instance: string } };

// Sugar for `removeInstance` aimed at the firing instance itself: a card's X
// says "close me" without knowing its own id. The runtime desugars it to
// `removeInstance` with the instance's real id before it escapes.
export type RemoveSelfEffect = { removeSelf: true };
export type ReloadEffect = { reload: true };

export type Effect =
  | CallEffect
  | EmitEffect
  | PushEffect
  | PopEffect
  | ReplaceEffect
  | PopToEffect
  | ResetToEffect
  | RemoveInstanceEffect
  | RemoveSelfEffect
  | ReloadEffect;

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
        action: z
          .string()
          .describe('Definition id of the action to push onto a canvas — MUST be an id that actually exists (an unknown id fails at click time, invisible to a mount check).'),
        canvas: z.string().optional().describe('Canvas id to push onto; defaults to the current canvas.'),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Initial input merged into the new action data. Keys must belong to the target action\'s declared input contract — invented keys are silently useless.'),
        with: z
          .array(z.string())
          .optional()
          .describe('Fragment ids to compose the action with before it is instantiated. Each wraps the action (the action fills its `{ slot }`) and contributes its triggers/data; the action wins on conflict. See ActionFragment.'),
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
        with: z
          .array(z.string())
          .optional()
          .describe('Fragment ids to compose the action with before it is instantiated. Each wraps the action (the action fills its `{ slot }`) and contributes its triggers/data; the action wins on conflict. See ActionFragment.'),
      })
      .strict()
      .describe('Replace parameters.'),
  })
  .strict()
  .describe('Replace the current action (escapes via onNavigate callback).');

const PopToEffectSchema = z
  .object({
    popTo: z
      .object({
        canvas: z.string().optional().describe('Canvas id to pop on; defaults to the current canvas.'),
        instance: z.string().describe('Pop the canvas until this instance id is on top (no-op if absent).'),
      })
      .strict()
      .describe('Pop-to-instance parameters.'),
  })
  .strict()
  .describe('Pop a canvas down to a given instance (escapes via onNavigate callback).');

const ResetToEffectSchema = z
  .object({
    resetTo: z
      .object({
        action: z.string().describe('Definition id of the new root action.'),
        canvas: z.string().optional().describe('Canvas id to reset; defaults to the current canvas.'),
        input: z.record(z.string(), z.unknown()).optional().describe('Initial input merged into the new root action.'),
        with: z.array(z.string()).optional().describe('Fragment ids to compose the action with. See ActionFragment.'),
      })
      .strict()
      .describe('Reset parameters.'),
  })
  .strict()
  .describe('Clear a canvas and push a single new root action (escapes via onNavigate callback).');

const RemoveInstanceEffectSchema = z
  .object({
    removeInstance: z
      .object({
        canvas: z.string().optional().describe('Canvas id to remove from; defaults to the current canvas.'),
        instance: z.string().describe('Instance id to unmount and drop from the stack (no-op if absent).'),
      })
      .strict()
      .describe('Remove-instance parameters.'),
  })
  .strict()
  .describe('Remove one instance anywhere in a canvas stack (escapes via onNavigate callback).');

const RemoveSelfEffectSchema = z
  .object({
    removeSelf: z.literal(true).describe('Sentinel literal — must be true. Removes the firing instance (desugars to removeInstance).'),
  })
  .strict()
  .describe('Close the firing instance — the list-card X (escapes via onNavigate callback).');

// Re-run the firing instance's `mount` hook — the action re-reads whatever it
// reads, in place, keeping its identity and its data.
//
// The gap this fills: a stacked canvas suspends what it covers and `resume`
// already re-runs mount, so a revealed action is never stale. A LIST canvas
// suspends nothing — every card stays active — so a card that loaded at seed
// time and is opened an hour later would show the hour-old answer. `reload` is
// what "opening it" means there.
const ReloadEffectSchema = z
  .object({
    reload: z.literal(true).describe('Sentinel literal — must be true. Re-runs this instance\'s mount hook.'),
  })
  .strict()
  .describe('Re-read the firing instance in place — the list-card open.');

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z
    .union([CallEffectSchema, EmitEffectSchema, PushEffectSchema, PopEffectSchema, ReplaceEffectSchema, PopToEffectSchema, ResetToEffectSchema, RemoveInstanceEffectSchema, RemoveSelfEffectSchema, ReloadEffectSchema])
    .describe('An effect that touches the outside world.'),
);
