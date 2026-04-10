// ═══════════════════════════════════════════════════════════
// Output parser — turn raw model content into typed agent output
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4.1. Three modes, each with its own narrow type:
//   - text       → Result<string>
//   - structured → Result<T> where T is inferred from outputSchema
//   - plan       → Result<ActionPlan>
//
// Splitting by mode keeps every consumer's return type clean —
// no `as`, no `T | string | unknown[]` widening, no laundering at
// the manifold boundary. executeAgent dispatches on mode and picks
// the right parser.

import type { ZodType } from 'zod';
import type { Result } from '../types';
import type { ActionPlan } from '../schemas';
import { ActionPlanSchema } from '../schemas/action-plan.schema';
import { makeError, ok, err } from '../errors/cortex.errors';

type ParseContext = { agentId: string; workflowId: string };

const tryJsonParse = (raw: string, ctx: ParseContext): Result<unknown> => {
  try {
    return ok(JSON.parse(raw));
  } catch (e) {
    return err(
      makeError(
        'output_validation_failed',
        `Model output is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        ctx,
      ),
    );
  }
};

// Many models wrap their JSON in markdown fences. Strip them so the
// parse step has a fighting chance. We deliberately do NOT strip
// other text — if the model produces prose around JSON, that's a
// model error and the user wants to see it.
const stripCodeFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch && fenceMatch[1] !== undefined) return fenceMatch[1].trim();
  return trimmed;
};

// ───────────────────────────────────────────────────────────
// Three narrow parsers — one per execution mode
// ───────────────────────────────────────────────────────────

// Trust boundary for text and plan modes.
//
// `executeAgent<T>` is generic in T because the agent author encodes
// the return type at the call site (defineAgent<MappingAgentOutput>,
// defineAgent<string>, defineAgent<ActionPlan>). For STRUCTURED mode
// the value flows through Zod and is type-correct end-to-end.
//
// For TEXT and PLAN modes there is no schema generic-parameter to
// thread the type through, so `parseTextOutput` and `parsePlanOutput`
// have fixed return types (`string`, `ActionPlan`). Adapting them to
// the caller's `<T>` requires a single trust-boundary cast — this
// helper is the ONE place in cortex where that cast lives. The
// runtime guarantee is that an agent declared with the right T (e.g.
// `defineAgent<string>` for text mode) will always receive a value
// that matches it. Mis-typing the agent is a programmer error caught
// at the agent's first call site, not silently widened later.
//
// A more invasive refactor (conditional types over `outputMode`)
// could eliminate this entirely; until that lands, this is the
// single, named, documented exception to the no-`as` rule.
// Exported so the plan-mode tick loop in execute.ts can also use the
// same single, named, documented trust point for `final.result`.
export const trustAgentReturn = <T>(value: unknown): T => value as T;
const trustAs = trustAgentReturn;

export const parseTextOutput = <T>(content: string): Result<T> => ok(trustAs<T>(content));

export const parseStructuredOutput = <T>(
  content: string,
  schema: ZodType<T>,
  ctx: ParseContext,
): Result<T> => {
  const json = tryJsonParse(stripCodeFence(content), ctx);
  if (!json.ok) return json;
  const validated = schema.safeParse(json.data);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return err(makeError('output_validation_failed', `Output failed schema: ${issues}`, ctx));
  }
  return ok(validated.data);
};

export const parsePlanOutput = <T>(content: string, ctx: ParseContext): Result<T> => {
  const json = tryJsonParse(stripCodeFence(content), ctx);
  if (!json.ok) return json;
  const validated = ActionPlanSchema.safeParse(json.data);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return err(makeError('invalid_plan', `Plan failed validation: ${issues}`, ctx));
  }
  // Trust boundary: ActionPlanSchema produces `ActionPlan`, the
  // caller's T is conventionally `ActionPlan` for plan-mode agents.
  return ok(trustAs<T>(validated.data));
};

// Re-export ActionPlan type for callers that need it.
export type { ActionPlan };
