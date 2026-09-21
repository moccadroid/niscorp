import { lineupExposed, lineupForDay, stageCapacities } from './lineup.entries';
import { weatherWindow } from './weather.entries';
import { salesDayTotals } from './sales.entries';
import { attendanceByZone, attendanceTotal } from './site.entries';
import { delaysRecent, incidentsOpen, lineupAround, weatherWarnings } from './situation.entries';

// CONTEXT PACKS — the facts a text model may be handed, declared as data.
//
// The agent is handed Jev's pre-decisions, and these are the FACTS among them:
// each pack is one or more NAMED, SEEDED vex reads, replayed over the session's
// own wire under the caller's policy, exactly like a card's load. There is no
// hand-written query on this path and there never will be — a pack is one row
// in this file plus entries beside it.
//
// Each pack becomes one `context/<id>` noul in the same wide pass that decides
// the cards ("does answering this need the running order?"), so choosing the
// context costs no round trip. `description` is that question's subject: write
// it for a model choosing what to fetch, the way an action's description is
// written for a model choosing what to open.
//
// THE CARDS' PACKS READ THE CARDS' ROWS. `situation`, `incidents` and
// `attendance` replay the very fingerprints `situation.now`, `incident.feed`
// and `attendance.now` load — so what the agent says about the site and the
// card standing beside its words were read from the same rows, and the two
// cannot disagree (DESIGN.md § Cards the questions need).
//
// `tables` names what the reads touch. A principal whose policy cannot read one
// of them is never ASKED about the pack — the same rule that keeps an action
// they lack from ever being a question.
//
// A read's `context` binds the entry's parameters. `{ heard }` takes what the
// parser read from the sentence, falling back to the festival clock; `offset`
// shifts an hour (clamped to the day), `times` scales it — minutes of the day
// are `{ heard: 'hour', times: 60 }`. Anything else is a literal.

export type PackValue = { heard: 'day' } | { heard: 'hour'; offset?: number; times?: number } | { value: string | number };

// ROWS A READ PUTS ON THE TABLE. A row of facts names other rows — the act in
// an exposed set, the stage it stands on — and once the agent has been handed
// them it may NAME them: open a form for that act, cite that set. `refs` says
// which keys of a read's rows are ids of which table, and which key words them;
// the loop harvests them into the rows an answer is admitted against, and keeps
// them for the rest of the thread. Undeclared keys are just data.
export type PackRef = { table: string; id: string; label: string };

export type PackRead = { name: string; fingerprint: string; context: Record<string, PackValue>; refs?: readonly PackRef[] };

export type ContextPack = {
  id: string;
  // What this is, in the operator's words, for the status line under an answer:
  // "read the running order and the weather · 2.1 s".
  noun: string;
  description: string;
  tables: readonly string[];
  reads: readonly PackRead[];
};

const ACT_AND_STAGE: readonly PackRef[] = [
  { table: 'acts', id: 'act_id', label: 'act_name' },
  { table: 'stages', id: 'stage_id', label: 'stage_name' },
];

const DAY: PackValue = { heard: 'day' };

export const CONTEXT_PACKS: readonly ContextPack[] = [
  {
    id: 'situation',
    noun: 'the situation',
    description: 'What is going on across the site right now — who is on stage and who is next, bad weather due in the next three hours, open incidents, holds called on sets; needed for an overview, a status, or "what is happening".',
    tables: ['slots', 'acts', 'stages', 'weather_hours', 'incidents', 'zones', 'delays'],
    reads: [
      { name: 'onStage', fingerprint: lineupAround.fingerprint, context: { day: DAY, fromMin: { heard: 'hour', times: 60 }, toMin: { heard: 'hour', offset: 3, times: 60 } }, refs: ACT_AND_STAGE },
      { name: 'weatherWarnings', fingerprint: weatherWarnings.fingerprint, context: { day: DAY, fromHour: { heard: 'hour' }, toHour: { heard: 'hour', offset: 3 } } },
      { name: 'openIncidents', fingerprint: incidentsOpen.fingerprint, context: {} },
      { name: 'holds', fingerprint: delaysRecent.fingerprint, context: {} },
    ],
  },
  {
    id: 'incidents',
    noun: 'the incident log',
    description: 'Every open incident, newest first — medical, security, technical, crowd and weather reports with where they are; needed when incidents, problems, injuries or what went wrong is part of the question.',
    tables: ['incidents', 'zones'],
    reads: [{ name: 'open', fingerprint: incidentsOpen.fingerprint, context: {} }],
  },
  {
    id: 'attendance',
    noun: 'the head count',
    description: 'How many people are on site against capacity, and how full each zone is; needed when numbers of guests, crowding, or whether people fit somewhere is part of the question.',
    tables: ['zones', 'zone_counts'],
    reads: [
      { name: 'total', fingerprint: attendanceTotal.fingerprint, context: { day: DAY, hour: { heard: 'hour' } } },
      { name: 'byZone', fingerprint: attendanceByZone.fingerprint, context: { day: DAY, hour: { heard: 'hour' } }, refs: [{ table: 'zones', id: 'zone_id', label: 'name' }] },
    ],
  },
  {
    id: 'lineup',
    noun: 'the running order',
    description: 'The running order for the day — every set, its act, its billing, its stage and its start time; needed to reason about who plays where and when, clashes, or what a change to the bill would collide with.',
    tables: ['slots', 'acts', 'stages'],
    reads: [{ name: 'sets', fingerprint: lineupForDay.fingerprint, context: { day: DAY }, refs: ACT_AND_STAGE }],
  },
  {
    // The rows the running order LIGHTS, handed over as rows: the same column
    // and the same words (vex/lineup.entries.ts), so "three sets are exposed"
    // and three lit bars are one fact read twice.
    id: 'exposure',
    noun: 'which sets are exposed',
    description: 'Which sets are exposed to bad weather — acts on an open-air stage while a rain, wind or storm warning is in force, with each act\'s expected crowd; needed whenever a storm, rain, wind, lightning or the weather threatens the programme.',
    tables: ['slots', 'acts', 'stages'],
    reads: [{ name: 'sets', fingerprint: lineupExposed.fingerprint, context: { day: DAY }, refs: ACT_AND_STAGE }],
  },
  {
    id: 'weather',
    noun: 'the weather',
    description: 'The weather window around the hour in question — condition, rain, wind and severity for the two hours either side; needed whenever rain, wind, lightning or a storm is part of the problem.',
    tables: ['weather_hours'],
    reads: [{ name: 'hours', fingerprint: weatherWindow.fingerprint, context: { day: DAY, fromHour: { heard: 'hour', offset: -2 }, toHour: { heard: 'hour', offset: 2 } } }],
  },
  {
    id: 'capacities',
    noun: 'stage capacities',
    description: 'Every stage with whether it is covered or open-air and how many people it holds; needed to judge whether people fit somewhere or which stage gives shelter.',
    tables: ['stages'],
    reads: [{ name: 'stages', fingerprint: stageCapacities.fingerprint, context: {}, refs: [{ table: 'stages', id: 'stage_id', label: 'name' }] }],
  },
  {
    id: 'sales',
    noun: 'the takings',
    description: 'Ticket and bar takings for the day, units and revenue; needed when money, takings, revenue or how trading is going is part of the question.',
    tables: ['sales_hourly'],
    reads: [{ name: 'totals', fingerprint: salesDayTotals.fingerprint, context: { day: DAY } }],
  },
];
