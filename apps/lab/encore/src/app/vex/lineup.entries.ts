import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// The bill: stages, acts and the slots that put one on the other.
//
// Most reads here alias straight to the shape their card renders. The running
// order is the exception, and for one reason: EXPOSURE has to arrive as words
// and a tone, and words are a mapping's business (rule 9), not a timeline's.

const slot = (key: string): Record<string, unknown> => ({ $get: { from: { $var: 'slot' }, path: [key] } });

// `slots.exposure` is the worst weather severity over a set on a stage with no
// roof (db/schema.ts keeps it, by trigger). Here it becomes what a card draws:
// a tone the timeline lights the bar in, and the word for why.
const exposureTone = { $case: { branches: [{ when: { $gte: [slot('exposure'), 2] }, then: 'alert' }, { when: { $gte: [slot('exposure'), 1] }, then: 'warn' }], else: '' } };
const exposureWord = { $case: { branches: [{ when: { $gte: [slot('exposure'), 2] }, then: 'exposed to the storm' }, { when: { $gte: [slot('exposure'), 1] }, then: 'exposed to rain and wind' }], else: '' } };

const SLOT_KEYS = ['slot_id', 'act_id', 'act_name', 'billing', 'draw', 'stage_id', 'stage_name', 'stage_kind', 'day', 'starts_at', 'start_min', 'end_min', 'exposure'] as const;

const withExposure = {
  $map: {
    over: { $ref: '$.result' },
    as: 'slot',
    body: { ...Object.fromEntries(SLOT_KEYS.map((key) => [key, slot(key)])), exposed: { $gte: [slot('exposure'), 1] }, exposure_tone: exposureTone, exposure_display: exposureWord },
  },
};

const SLOT_SHAPE = { slot_id: '', act_id: '', act_name: '', billing: '', draw: 0, stage_id: '', stage_name: '', stage_kind: '', day: '', starts_at: '', start_min: 0, end_min: 0, exposure: 0, exposed: false, exposure_tone: '', exposure_display: '' };

const SLOT_FIELDS = [
  { field: 'slots.id', as: 'slot_id' },
  { field: 'acts.id', as: 'act_id' },
  { field: 'acts.name', as: 'act_name' },
  'acts.billing',
  'acts.draw',
  { field: 'stages.id', as: 'stage_id' },
  { field: 'stages.name', as: 'stage_name' },
  { field: 'stages.kind', as: 'stage_kind' },
  'slots.day',
  'slots.starts_at',
  'slots.start_min',
  'slots.end_min',
  'slots.exposure',
];

// The running order for one day. `stageId` is OPTIONAL: absent, every stage;
// supplied, the one — so the timeline and the stage view replay the same plan
// instead of being two entries that drift.
export const lineupForDay: SeedEntry = {
  fingerprint: 'lineup/forDay',
  intent: 'Every set on one festival day, optionally for a single stage, in stage then time order',
  shape: [SLOT_SHAPE],
  dsl: {
    from: ['slots', 'acts', 'stages'],
    fields: SLOT_FIELDS,
    filter: {
      and: [
        { eq: ['slots.day', { $context: 'day' }] },
        { optional: { key: 'stageId', then: { eq: ['slots.stage_id', { $context: 'stageId' }] } } },
      ],
    },
    sort: [
      { field: 'stages.capacity', dir: 'desc' },
      { field: 'slots.start_min', dir: 'asc' },
    ],
    limit: 60,
  },
  mapping: withExposure,
};

// ONLY the exposed sets of a day, worst first — what the `exposure` context pack
// hands the agent. The same column and the same words the timeline lights its
// bars from, so "three sets are exposed" and three lit bars cannot disagree.
export const lineupExposed: SeedEntry = {
  fingerprint: 'lineup/exposed',
  intent: 'The sets of one festival day on an open-air stage under a weather warning, worst and biggest first, with each act\'s expected draw',
  shape: [SLOT_SHAPE],
  dsl: {
    from: ['slots', 'acts', 'stages'],
    fields: SLOT_FIELDS,
    filter: { and: [{ eq: ['slots.day', { $context: 'day' }] }, { gte: ['slots.exposure', 1] }] },
    sort: [
      { field: 'slots.exposure', dir: 'desc' },
      { field: 'acts.draw', dir: 'desc' },
    ],
    limit: 20,
  },
  mapping: withExposure,
};

// One act WITH the set it is billed for. The swap form reads this too: where an
// act is playing right now is a fact in `slots`, so the form's from-stage comes
// from the row, not from whatever the sentence happened to mention.
export const actById: SeedEntry = {
  fingerprint: 'acts/byId',
  intent: 'One act by id with its billed set: stage, day and start time',
  shape: { act_id: '', name: '', billing: '', genre: '', draw: 0, slot_id: '', stage_id: '', stage_name: '', day: '', starts_at: '', duration_min: 0 },
  dsl: {
    from: ['acts', 'slots', 'stages'],
    fields: [
      { field: 'acts.id', as: 'act_id' },
      'acts.name',
      'acts.billing',
      'acts.genre',
      'acts.draw',
      { field: 'slots.id', as: 'slot_id' },
      { field: 'stages.id', as: 'stage_id' },
      { field: 'stages.name', as: 'stage_name' },
      'slots.day',
      'slots.starts_at',
      'slots.duration_min',
    ],
    filter: { eq: ['acts.id', { $context: 'actId' }] },
    limit: 1,
  },
};

export const stageById: SeedEntry = {
  fingerprint: 'stages/byId',
  intent: 'One stage by id with the zone it stands in',
  shape: { stage_id: '', name: '', kind: '', capacity: 0, zone_name: '' },
  dsl: {
    from: ['stages', 'zones'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, 'stages.name', 'stages.kind', 'stages.capacity', { field: 'zones.name', as: 'zone_name' }],
    filter: { eq: ['stages.id', { $context: 'stageId' }] },
    limit: 1,
  },
};

// Every stage and what it holds — the facts "will they fit under canvas" turns
// on. Four rows; the text model is handed all of them or none.
export const stageCapacities: SeedEntry = {
  fingerprint: 'stages/capacities',
  intent: 'Every stage with its kind (covered or open-air) and capacity',
  shape: [{ stage_id: '', name: '', kind: '', capacity: 0 }],
  dsl: {
    from: ['stages'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, 'stages.name', 'stages.kind', 'stages.capacity'],
    sort: [{ field: 'stages.capacity', dir: 'desc' }],
    limit: 12,
  },
};

export const delaysForAct: SeedEntry = {
  fingerprint: 'delays/forAct',
  intent: 'Delays called on one act, newest first',
  shape: [{ delay_id: '', minutes: 0, created_by: '' }],
  dsl: {
    from: ['delays'],
    fields: [{ field: 'delays.id', as: 'delay_id' }, 'delays.minutes', 'delays.created_by'],
    filter: { eq: ['delays.act_id', { $context: 'actId' }] },
    sort: [{ field: 'delays.created_at', dir: 'desc' }],
    limit: 10,
  },
};

// ─── writes ──────────────────────────────────────────────────

// Move a set. The WHERE carries the from-stage on purpose: the form was filled
// against a running order that may have moved since, and a swap that lands only
// if the act is still where the operator believed it was is the cheap half of
// an optimistic lock. Zero rows back means "look again", not "done".
export const slotSwap: SeedMutation = {
  fingerprint: 'slots/swap',
  intent: 'Move the set of one act on one day to another stage and start time',
  mutation: {
    op: 'update',
    table: 'slots',
    set: { stage_id: { $context: 'toStageId' }, starts_at: { $context: 'time' } },
    where: {
      and: [
        { eq: ['slots.act_id', { $context: 'actId' }] },
        { eq: ['slots.day', { $context: 'day' }] },
        { eq: ['slots.stage_id', { $context: 'fromStageId' }] },
      ],
    },
  },
};

// A delay is a ledger row, not an edit to the slot: the mutation grammar has no
// arithmetic (deliberately), and "who called a twenty-minute hold, and when" is
// worth more after the weekend than a start time that silently moved.
export const delayAdd: SeedMutation = {
  fingerprint: 'delays/add',
  intent: 'Record a delay called on the set of one act',
  mutation: { op: 'insert', table: 'delays', values: { act_id: { $context: 'actId' }, minutes: { $context: 'minutes' } } },
};
