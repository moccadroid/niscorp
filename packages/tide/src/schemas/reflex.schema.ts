import { z } from 'zod';
import { ClockTriggerSchema, ManualTriggerSchema, RunTriggerSchema, SignalTriggerSchema, TriggerSchema, WriteTriggerSchema } from './trigger.schema';
import { DEFAULT_POLICY, PolicySchema } from './policy.schema';

// ═══════════════════════════════════════════════════════════════
// Reflex — the artifact.
//
// A trigger, an optional selection, exactly one effect, a policy.
// A straight arc from stimulus to response with no deliberation
// between: there is no step language here, and a multi-step flow
// is a CHAIN of reflexes joined by committed rows.
//
// `select.query` and every template are `unknown` ON PURPOSE. The
// moment tide validates a query it owns a query language; the
// moment it evaluates an expression it owns an evaluator. Both
// exist in the stack already, behind seams. Tide stores, diffs and
// hashes these blobs, and hands them over verbatim.
// ═══════════════════════════════════════════════════════════════

export const SelectionSchema = z
  .object({
    query: z.unknown().describe('Handed to the `select` seam verbatim. Under moss: a vex { fingerprint, context } replay.'),
    mode: z
      .enum(['each', 'batch'])
      .default('each')
      .describe('each → one task per row; batch → one task carrying all rows (bounded sets only).'),
    unitKey: z.string().optional().describe('The row field keying a unit task. `each` mode only; duplicates fail the firing.'),
  })
  .strict();

export const EffectRefSchema = z
  .object({
    name: z.string().describe('A registered effect. The reflex names it; the registry supplies the handler.'),
    input: z.unknown().optional().describe('A template, evaluated per unit by the `transform` seam.'),
  })
  .strict();

const reflexFields = {
  id: z.string().min(1).describe("Unique. A tenant's reflex is the tenant's own row, with its own id."),
  intent: z.string().min(1).describe("One factual sentence — what this does, in the person's language."),
  on: TriggerSchema,
  as: z.string().optional().describe('The identity this runs under. Opaque to tide; the host resolves it.'),
  params: z.record(z.string(), z.unknown()).optional().describe('Authored knobs, visible to templates as $.params.'),
  select: SelectionSchema.optional().describe('Omitted = the trigger itself is the unit.'),
  when: z.unknown().optional().describe('A predicate template. FACT triggers only — a query belongs in `select`.'),
  effect: EffectRefSchema,
  policy: PolicySchema.default(DEFAULT_POLICY),
  enabled: z.boolean().default(true).describe('A switch on the row, not part of the definition — flipping it is not an edit.'),
};

const reflexRules = (reflex: { on: object; when?: unknown; select?: { mode: string; unitKey?: string | undefined } | undefined }, ctx: z.RefinementCtx): void => {
  if (reflex.when !== undefined && !('fact' in reflex.on))
    ctx.addIssue({ code: 'custom', message: '`when` is for fact triggers; a clock condition belongs in `select`', path: ['when'] });
  if (reflex.select?.mode === 'each' && reflex.select.unitKey === undefined)
    ctx.addIssue({ code: 'custom', message: "`each` mode needs a unitKey — it is the task's idempotency grain", path: ['select', 'unitKey'] });
};

export const ReflexSchema = z.object(reflexFields).strict().superRefine(reflexRules);

// ═══════════════════════════════════════════════════════════════
// Draft — a reflex as it is WRITTEN, before it is saved.
//
// What a model writes: a name, an intent, a trigger and an effect — and
// nothing that is the host's (who it runs as, its policy, whether it is
// enabled). Which triggers, and whether the extra fields a data-driven
// automation needs, are the CALLER'S choice (`draftSchemaOf`): a draft may
// only use what its host can run, the way it may only name the effects its
// host offers. That schema is what the model is shown, and what it is held
// to; what is stored is still the full ReflexSchema, completed when the
// draft is saved (`anchorDraft`).
//
// One trigger exists only here: the TIMER — "this long from now". A timer
// is sugar, never stored. `now` is only known when somebody saves the
// draft, so the host anchors it then, and what is stored and run is an
// ordinary one-shot clock — which survives a restart, because it names an
// instant rather than a distance from one.
// ═══════════════════════════════════════════════════════════════

export const TimerSchema = z
  .object({
    hours: z.number().int().min(0).optional(),
    minutes: z.number().int().min(0).optional(),
    seconds: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((timer) => (timer.hours ?? 0) + (timer.minutes ?? 0) + (timer.seconds ?? 0) > 0, { message: 'a timer needs a length' });

export const TimerTriggerSchema = z
  .object({ timer: TimerSchema.describe('A length of time from now, as hours, minutes and seconds (each optional, together more than zero). Fires once, that long after the reflex is saved — not after it is written. A clock is for a time of day or a date.') })
  .strict();

// The trigger kinds a draft can be offered, by name.
export const DRAFT_TRIGGERS = {
  clock: ClockTriggerSchema,
  timer: TimerTriggerSchema,
  write: WriteTriggerSchema,
  signal: SignalTriggerSchema,
  run: RunTriggerSchema,
  manual: ManualTriggerSchema,
} as const;
export type DraftTrigger = keyof typeof DRAFT_TRIGGERS;
const ALL_DRAFT_TRIGGERS: readonly DraftTrigger[] = ['clock', 'timer', 'write', 'signal', 'run', 'manual'];

// The fields beyond name, intent, trigger and effect a draft can be offered —
// for automations that select rows or test a fact before they act.
export type DraftField = 'params' | 'select' | 'when';

// What the caller offers a draft: its trigger kinds (every kind, if it names
// none) and its extra fields (none, if it names none).
export type DraftChoice = { triggers?: readonly DraftTrigger[]; fields?: readonly DraftField[] };

const draftCore = {
  id: z.string().min(1).describe('A short name for this automation.'),
  intent: reflexFields.intent,
  effect: EffectRefSchema,
};

// The widest draft: every trigger, every extra field — the TYPE every
// narrower draft is, and what `anchorDraft` completes.
const WidestDraftSchema = z
  .object({ ...draftCore, on: z.union([TriggerSchema, TimerTriggerSchema]), params: reflexFields.params, select: reflexFields.select, when: reflexFields.when })
  .strict();
export type ReflexDraft = z.infer<typeof WidestDraftSchema>;

// The draft schema for what the caller offers — tide's own pieces, each with
// the description it already has: the widest draft, cut to the chosen fields,
// its trigger narrowed to the chosen kinds. Nothing is restated here.
export const draftSchemaOf = (choice: DraftChoice = {}): z.ZodType<ReflexDraft> => {
  const [first, ...rest] = (choice.triggers ?? ALL_DRAFT_TRIGGERS).map((kind): z.ZodType<ReflexDraft['on']> => DRAFT_TRIGGERS[kind]);
  if (first === undefined) throw new Error('tide: a draft needs at least one trigger kind');
  const on: z.ZodType<ReflexDraft['on']> = rest.length === 0 ? first : z.union([first, ...rest]);
  const has = (field: DraftField): boolean => choice.fields?.includes(field) ?? false;
  const keep: { [key in keyof ReflexDraft]?: true } = {
    id: true,
    intent: true,
    effect: true,
    on: true,
    ...(has('params') ? { params: true as const } : {}),
    ...(has('select') ? { select: true as const } : {}),
    ...(has('when') ? { when: true as const } : {}),
  };
  return WidestDraftSchema.pick(keep).extend({ on }).strict().superRefine(reflexRules);
};

// The default draft: every trigger kind, no extra fields.
export const ReflexDraftSchema = draftSchemaOf();

export type Selection = z.infer<typeof SelectionSchema>;
export type EffectRef = z.infer<typeof EffectRefSchema>;
export type Reflex = z.infer<typeof ReflexSchema>;
export type ReflexInput = z.input<typeof ReflexSchema>;
export type Timer = z.infer<typeof TimerSchema>;
