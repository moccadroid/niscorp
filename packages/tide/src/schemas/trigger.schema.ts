import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// Triggers — four kinds, closed.
//
// Structured on purpose: a reflex is shown to the operator it
// affects, and `{ every: 'month', on: 1, at: '03:00' }` is
// reviewable by the person it bills where `0 3 1 * *` is a
// shibboleth. Cron-string sugar belongs in tooling, never in the
// stored artifact.
// ═══════════════════════════════════════════════════════════════

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export const ClockUnitSchema = z.enum(['day', 'week', 'month', 'year']);

export const ClockRecurringSchema = z
  .object({
    every: ClockUnitSchema.describe('The calendar period this reflex recurs on.'),
    on: z
      .union([z.number().int().min(1).max(31), z.enum(WEEKDAYS), z.string().regex(MMDD)])
      .optional()
      .describe('week → a weekday; month → 1..31 (clamped to month end); year → "MM-DD". Omitted for day.'),
    at: z.string().regex(HHMM).describe('Local wall-clock time, "HH:MM".'),
    tz: z.string().describe('IANA timezone name — the owning tenant\'s zone.'),
  })
  .strict()
  .superRefine((clock, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['on'] });
    if (clock.every === 'day' && clock.on !== undefined) fail('a daily clock takes no `on`');
    if (clock.every === 'week' && !(typeof clock.on === 'string' && WEEKDAYS.some((d) => d === clock.on)))
      fail('a weekly clock needs `on` as a weekday (mon..sun)');
    if (clock.every === 'month' && typeof clock.on !== 'number') fail('a monthly clock needs `on` as a day number');
    if (clock.every === 'year' && !(typeof clock.on === 'string' && MMDD.test(clock.on)))
      fail('a yearly clock needs `on` as "MM-DD"');
  });

export const ClockOnceSchema = z
  .object({
    at: z.string().regex(LOCAL_DATETIME).describe('One-shot local datetime, "YYYY-MM-DDTHH:MM".'),
    tz: z.string().describe('IANA timezone name.'),
  })
  .strict();

export const ClockTriggerSchema = z
  .object({ clock: z.union([ClockRecurringSchema, ClockOnceSchema]) })
  .strict();

export const OpSchema = z.enum(['insert', 'update', 'delete']);

export const WriteTriggerSchema = z
  .object({
    fact: z
      .object({
        entity: z.string().describe('The table or entity whose writes wake this reflex.'),
        op: OpSchema.optional().describe('Narrow to one op — "only on create" is op: "insert".'),
      })
      .strict(),
  })
  .strict();

export const SignalTriggerSchema = z
  .object({ fact: z.object({ signal: z.string().describe('The named intake — a webhook, an inbound SMS.') }).strict() })
  .strict();

export const FiringTriggerSchema = z
  .object({
    fact: z
      .object({ firing: z.string().describe('A reflex id — fires when THAT reflex\'s firing settles. Fan-in and dependency.') })
      .strict(),
  })
  .strict();

// A poll is a fact SOURCE for hosts with no write choke point: run the
// selection, diff against the stored cursor, mint write facts for the
// delta. The polling reflex subscribes to its own `entity` implicitly —
// and so may anyone else, which is the whole reason the delta becomes
// facts rather than private state.
export const PollTriggerSchema = z
  .object({
    poll: z
      .object({
        everyMs: z.number().int().positive().describe('How often to re-run the selection and diff the watermark.'),
        entity: z.string().describe('The entity minted facts are attributed to. Other reflexes may watch it too.'),
        cursor: z.string().describe('The row field that advances monotonically — the watermark reads this.'),
      })
      .strict(),
  })
  .strict();

export const ManualTriggerSchema = z.object({ manual: z.object({}).strict() }).strict();

export const TriggerSchema = z.union([
  ClockTriggerSchema,
  WriteTriggerSchema,
  SignalTriggerSchema,
  FiringTriggerSchema,
  PollTriggerSchema,
  ManualTriggerSchema,
]);

export type ClockRecurring = z.infer<typeof ClockRecurringSchema>;
export type ClockOnce = z.infer<typeof ClockOnceSchema>;
export type Clock = ClockRecurring | ClockOnce;
export type Trigger = z.infer<typeof TriggerSchema>;
export type Op = z.infer<typeof OpSchema>;
export type Weekday = (typeof WEEKDAYS)[number];

// ── narrowing helpers: the union is structural, so every consumer
// would otherwise re-derive these three checks ───────────────────

export const clockOf = (trigger: Trigger): Clock | undefined => ('clock' in trigger ? trigger.clock : undefined);

export const isRecurring = (clock: Clock): clock is ClockRecurring => 'every' in clock;

export const pollOf = (trigger: Trigger): { everyMs: number; entity: string; cursor: string } | undefined =>
  'poll' in trigger ? trigger.poll : undefined;

export const factOf = (
  trigger: Trigger,
): { entity?: string; op?: Op; signal?: string; firing?: string } | undefined =>
  'fact' in trigger ? trigger.fact : undefined;

export const isManual = (trigger: Trigger): boolean => 'manual' in trigger;
