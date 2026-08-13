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

export const RunTriggerSchema = z
  .object({
    fact: z
      .object({ run: z.string().describe('A reflex id — fires when THAT reflex\'s run settles. Fan-in and dependency.') })
      .strict(),
  })
  .strict();

// There is NO poll trigger, and the absence is a decision. Polls existed
// for hosts with no write choke point — run a selection, diff a cursor,
// mint write facts for the delta. In this stack the host's DAL IS the
// choke point: every application write becomes a fact at the vex bridge,
// so a poll could only ever re-discover what was already pushed, one
// interval late. An external source with no choke point enters through an
// importer that ingests write facts at the door — the same shape, without
// a reflex secretly re-querying.
export const ManualTriggerSchema = z.object({ manual: z.object({}).strict() }).strict();

export const TriggerSchema = z.union([
  ClockTriggerSchema,
  WriteTriggerSchema,
  SignalTriggerSchema,
  RunTriggerSchema,
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

export const factOf = (
  trigger: Trigger,
): { entity?: string; op?: Op; signal?: string; run?: string } | undefined =>
  'fact' in trigger ? trigger.fact : undefined;

export const isManual = (trigger: Trigger): boolean => 'manual' in trigger;
