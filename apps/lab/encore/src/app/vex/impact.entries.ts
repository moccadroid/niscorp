import type { SeedEntry } from '@niscorp/vex';

// WHAT WOULD MOVING THIS SET DO? — the reads behind `move.impact`.
//
// Four lines on one card, each with a verdict — fits · tight · does not fit —
// and THE VERDICTS ARE COMPUTED HERE, in the mapping, never in a component
// (rule 9): the card's layout binds `verdict`, `tone` and `line` and has no
// idea what a capacity is. It also means the agent, replaying these same
// fingerprints, reads the same verdicts the operator is looking at.
//
// A mapping sees `$.result` and, beside it, the request's `$.context` — which
// is how a verdict can be about TWO tables that have no relation to join on:
// the act's expected draw rides the context of the read over the target stage,
// and the stage's cover rides the context of the read over the weather.
//
// Thresholds are the festival's, stated once:
//   capacity    draw ≤ 85% of the stage fits · up to 100% is tight · over is not
//   changeover  30 min clear either side fits · 15 is tight · under is not
//   weather     under a roof always fits · open-air under a warning is tight ·
//               open-air under severity 2+ does not

const FITS = 'fits';
const TIGHT = 'tight';
const DOES_NOT_FIT = 'does not fit';

const TONE = { [FITS]: 'good', [TIGHT]: 'warn', [DOES_NOT_FIT]: 'alert' } as const;

const result = (key: string): Record<string, unknown> => ({ $get: { from: { $ref: '$.result' }, path: [key], fallback: null } });
const context = (key: string): Record<string, unknown> => ({ $ref: `$.context.${key}` });
const count = (value: unknown): Record<string, unknown> => ({ $localeNumber: { value, locale: 'en-GB' } });
const verdictOf = (branches: { when: unknown; then: string }[], otherwise: string): Record<string, unknown> => ({ $case: { branches, else: otherwise } });
const toneOf = (verdict: unknown): Record<string, unknown> => ({
  $case: { branches: [{ when: { $eq: [verdict, FITS] }, then: TONE[FITS] }, { when: { $eq: [verdict, TIGHT] }, then: TONE[TIGHT] }], else: TONE[DOES_NOT_FIT] },
});

// ─── the act being moved ─────────────────────────────────────
// Its draw and how long it plays: what the other three reads are asked with.
export const impactAct: SeedEntry = {
  fingerprint: 'impact/act',
  intent: 'One act with its expected draw and the length, stage and start of its billed set',
  shape: { act_id: '', name: '', draw: 0, duration_min: 0, stage_name: '', starts_at: '', day: '' },
  dsl: {
    from: ['acts', 'slots', 'stages'],
    fields: [{ field: 'acts.id', as: 'act_id' }, 'acts.name', 'acts.draw', 'slots.duration_min', { field: 'stages.name', as: 'stage_name' }, 'slots.starts_at', 'slots.day'],
    filter: { eq: ['acts.id', { $context: 'actId' }] },
    limit: 1,
  },
};

// ─── capacity against draw ───────────────────────────────────
const capacityVerdict = {
  $with: {
    let: { share: { $div: [context('draw'), result('capacity')] } },
    value: verdictOf(
      [
        { when: { $lte: [{ $var: 'share' }, 0.85] }, then: FITS },
        { when: { $lte: [{ $var: 'share' }, 1] }, then: TIGHT },
      ],
      DOES_NOT_FIT,
    ),
  },
};

export const impactCapacity: SeedEntry = {
  fingerprint: 'impact/capacity',
  intent: 'Whether an expected draw fits the capacity of one stage, with a verdict: fits, tight or does not fit',
  shape: { stage_id: '', name: '', kind: '', capacity: 0, verdict: '', tone: '', line: '' },
  dsl: {
    from: ['stages'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, 'stages.name', 'stages.kind', 'stages.capacity'],
    filter: { eq: ['stages.id', { $context: 'stageId' }] },
    limit: 1,
  },
  mapping: {
    stage_id: result('stage_id'),
    name: result('name'),
    kind: result('kind'),
    capacity: result('capacity'),
    verdict: capacityVerdict,
    tone: toneOf(capacityVerdict),
    line: { $join: { parts: [count(context('draw')), ' expected · ', result('name'), ' holds ', count(result('capacity'))], sep: '' } },
  },
};

// ─── what is already on the target stage ─────────────────────
// Every OTHER set on that stage that day, and how each sits against the window
// the moved set would occupy. One read, two lines: what overlaps is a clash;
// of what does not, the nearest edge is the changeover.
const set = (key: string): Record<string, unknown> => ({ $get: { from: { $var: 'set' }, path: [key] } });
const overlaps = { $and: [{ $gt: [set('end_min'), context('fromMin')] }, { $lt: [set('start_min'), context('toMin')] }] };
// Minutes of clear stage between the two sets: before ours, or after it.
const gap = { $case: { branches: [{ when: { $lte: [set('end_min'), context('fromMin')] }, then: { $sub: [context('fromMin'), set('end_min')] } }], else: { $sub: [set('start_min'), context('toMin')] } } };

const clashes = { $filter: { over: { $ref: '$.result' }, as: 'set', when: overlaps } };
const gaps = { $map: { over: { $filter: { over: { $ref: '$.result' }, as: 'set', when: { $not: overlaps } } }, as: 'set', body: gap } };
const nearest = { $min: { over: gaps } };

const clashVerdict = verdictOf([{ when: { $eq: [{ $count: { over: clashes } }, 0] }, then: FITS }], DOES_NOT_FIT);
const changeoverVerdict = verdictOf(
  [
    { when: { $eq: [{ $count: { over: gaps } }, 0] }, then: FITS },
    { when: { $gte: [nearest, 30] }, then: FITS },
    { when: { $gte: [nearest, 15] }, then: TIGHT },
  ],
  DOES_NOT_FIT,
);

export const impactStageDay: SeedEntry = {
  fingerprint: 'impact/stageDay',
  intent: 'The other sets on one stage on one day against a window of minutes: which clash with it, and the changeover gap to the nearest one, each with a verdict',
  // An ARRAY shape on purpose: vex hands a mapping the rows as `$.result` only
  // when the shape is a list (a single shape gets the first row), and these two
  // lines are computed over all of them. So the read returns its two lines as
  // two rows, which is also exactly what the card loops.
  shape: [{ key: '', label: '', verdict: '', tone: '', line: '' }],
  dsl: {
    from: ['slots', 'acts'],
    fields: [{ field: 'slots.id', as: 'slot_id' }, { field: 'acts.name', as: 'act_name' }, 'slots.starts_at', 'slots.start_min', 'slots.end_min'],
    filter: {
      and: [
        { eq: ['slots.stage_id', { $context: 'stageId' }] },
        { eq: ['slots.day', { $context: 'day' }] },
        { neq: ['slots.act_id', { $context: 'actId' }] },
      ],
    },
    sort: [{ field: 'slots.start_min', dir: 'asc' }],
    limit: 30,
  },
  mapping: [
    {
      key: 'clash',
      label: 'clashes',
      verdict: clashVerdict,
      tone: toneOf(clashVerdict),
      line: {
        $case: {
          branches: [{ when: { $eq: [{ $count: { over: clashes } }, 0] }, then: 'the stage is free for the whole set' }],
          else: { $join: { parts: [{ $join: { parts: [{ $map: { over: clashes, as: 'set', body: { $join: { parts: [set('act_name'), ' from ', set('starts_at')], sep: '' } } } }], sep: '' } }, ' already has it'], sep: '' } },
        },
      },
    },
    {
      key: 'changeover',
      label: 'changeover',
      verdict: changeoverVerdict,
      tone: toneOf(changeoverVerdict),
      line: { $case: { branches: [{ when: { $eq: [{ $count: { over: gaps } }, 0] }, then: 'nothing else on that stage to change over from' }], else: { $join: { parts: [nearest, ' min to the nearest other set'], sep: '' } } } },
    },
  ],
};

// ─── the sky over it ─────────────────────────────────────────
const open = { $neq: [context('kind'), 'covered'] };
const coverVerdict = verdictOf(
  [
    { when: { $not: open }, then: FITS },
    { when: { $gte: [result('severity'), 2] }, then: DOES_NOT_FIT },
    { when: { $gte: [result('severity'), 1] }, then: TIGHT },
  ],
  FITS,
);

export const impactCover: SeedEntry = {
  fingerprint: 'impact/cover',
  intent: 'The weather at one day and hour against whether a stage is covered, with a verdict: fits, tight or does not fit',
  shape: { condition: '', severity: 0, verdict: '', tone: '', line: '' },
  dsl: {
    from: ['weather_hours'],
    fields: ['weather_hours.condition', 'weather_hours.severity', 'weather_hours.wind_kph'],
    filter: { and: [{ eq: ['weather_hours.day', { $context: 'day' }] }, { eq: ['weather_hours.hour', { $context: 'hour' }] }] },
    limit: 1,
  },
  mapping: {
    condition: result('condition'),
    severity: result('severity'),
    verdict: coverVerdict,
    tone: toneOf(coverVerdict),
    line: { $join: { parts: [result('condition'), ', wind ', result('wind_kph'), ' kph · ', { $case: { branches: [{ when: open, then: 'open-air' }], else: 'under cover' } }], sep: '' } },
  },
};
