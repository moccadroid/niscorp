import { z } from 'zod';
import { ClockTriggerSchema, ManualTriggerSchema, RunTriggerSchema, SignalTriggerSchema, TriggerSchema, WriteTriggerSchema } from './trigger.schema';
import { DEFAULT_POLICY, PolicySchema } from './policy.schema';

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

export type DraftField = 'params' | 'select' | 'when';

export type DraftChoice = { triggers?: readonly DraftTrigger[]; fields?: readonly DraftField[] };

const draftCore = {
  id: z.string().min(1).describe('A short name for this automation.'),
  intent: reflexFields.intent,
  effect: EffectRefSchema,
};

const WidestDraftSchema = z
  .object({ ...draftCore, on: z.union([TriggerSchema, TimerTriggerSchema]), params: reflexFields.params, select: reflexFields.select, when: reflexFields.when })
  .strict();
export type ReflexDraft = z.infer<typeof WidestDraftSchema>;

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

export const ReflexDraftSchema = draftSchemaOf();

export type Selection = z.infer<typeof SelectionSchema>;
export type EffectRef = z.infer<typeof EffectRefSchema>;
export type Reflex = z.infer<typeof ReflexSchema>;
export type ReflexInput = z.input<typeof ReflexSchema>;
export type Timer = z.infer<typeof TimerSchema>;
