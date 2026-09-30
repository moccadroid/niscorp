import type { ActionDefinition } from '@niscorp/nova';
import {
  documentLayout,
  endLayout,
  incidentLayout,
  mossLayout,
  onceLayout,
  pressLayout,
  strataLayout,
  tideLayout,
  twiceLayout,
  vexLayout,
  wordsLayout,
} from './later.layouts';

// AFTER THE SAFETY SECTION — the rest of nisc, each part the same move in one
// more place: Moss and Charter (who gets what, enforced twice), Vex (a query is
// a stored document, replayed by name; asked in words, a small model chooses),
// the assistant (it prepares, you press), Tide (the timer from the start of the
// talk, as the row it is), Strata (a grammar change is a migration), and the
// end — the slide the timer puts up.
//
// Every code block is the real source, re-wrapped to fit where a line is long;
// `…` marks what was left out. The timer is read live (room.timer).

const code = (...lines: string[]): string => lines.join('\n');

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

export const mossSlide = still('slide.moss', 'Your shell runs on the server.', mossLayout, {
  kicker: 'Moss',
  from: 'Your shell, on the server',
  to: 'Your phone',
  lanes: [
    { label: 'What to draw', toward: 'to', ink: 'signal' },
    { label: 'What you pressed', toward: 'from', ink: 'alert' },
  ],
});

// Two roles from app/charter/charter.ts, as written.
export const charterSlide = still('slide.charter', 'Who gets what is one document.', documentLayout, {
  kicker: 'Charter',
  file: 'charter.ts, two of its roles',
  code: code(
    'member: {',
    "  actions: ['member.*', 'query.*',",
    "    'assistant.*', 'ext.member.*'],",
    '  data: [...ROOM_READS, ...QUERYING,',
    '    ...QUESTIONING, ...CONVERSING, ...LOOK],',
    '},',
    '',
    "clock: { data: ['deck.write.update'] },",
  ),
  marked: [8],
});

// The questions rule from app/vex/behaviors.ts.
export const twiceSlide = still('slide.twice', 'Checked in two places.', twiceLayout, {
  shell: 'An action you are not granted is never sent to you.',
  code: code(
    'questions: {',
    '  default: {',
    "    insert: [{ set: 'member_id', to: 'userId' }],",
    "    read: [{ match: 'member_id', to: 'userId' }],",
    '    …',
  ),
  marked: [3, 4],
});

// members/counts from app/vex/member.entries.ts — the strip's joined count.
export const vexSlide = still('slide.vex', 'A query is a document too.', vexLayout, {
  kicker: 'Vex',
  file: 'members/counts, as stored',
  stored: code(
    '{',
    "  fingerprint: 'members/counts',",
    "  refresh: 'reactive',",
    "  intent: 'How many people have joined',",
    '  shape: { joined: 0 },',
    '  dsl: {',
    "    from: ['members'],",
    "    aggregate: { joined: { count: '*' } },",
    '  },',
    '}',
  ),
  marked: [4, 5],
  sent: code('{', "  fingerprint: 'members/counts',", '  context: {},', '}'),
});

export const wordsSlide = still('slide.words', 'Asked in words.', wordsLayout, {
  kicker: 'The assistant’s queries — a small model picks which way',
  outcomes: [
    { area: 'again', ink: 'live', label: 'Asked before', what: 'Replayed. No model.' },
    { area: 'new', ink: 'signal', label: 'New', what: 'Written once, then stored.' },
    { area: 'cannot', ink: 'paper', label: 'Past your policy', what: 'Refused, with why.' },
  ],
});

export const waterSlide = still('slide.water', '18,000 cups of water.', incidentLayout, {
  kicker: 'A drive-through AI took this order, 2025',
});

export const pressSlide = still('slide.press', 'It prepares. You press.', pressLayout, {
  can: [{ text: 'Reads your screen.' }, { text: 'Opens an action, filled in.' }],
});

// The timer saved at the start of the talk, read as the stage: the row's
// reflex document, printed, and when it fires.
export const tideSlide: ActionDefinition = {
  id: 'slide.tide',
  title: 'The timer from the start is a row.',
  data: { kicker: 'Tide', title: 'The timer from the start is a row.', timer: { code: '', marked: [], due_at: '' } },
  layout: tideLayout,
  endpoints: { timer: { fn: 'room.timer', target: 'timer' } },
  lifecycle: { mount: [{ call: 'timer' }] },
  triggers: [],
};

export const onceSlide = still('slide.once', 'Automations without an agent loop', onceLayout, {});

// This app's strata.lock.json, as committed.
export const strataSlide = still('slide.strata', 'A grammar change is a migration.', strataLayout, {
  kicker: 'Strata',
  file: 'strata.lock.json — what this source is written in',
  code: code('{', '  "grammar": {', '    "lyceum.kit": 6,', '    "nisc.nova": 2,', '    "nisc.prism": 1', '  }', '}'),
});

export const endSlide = still('slide.end', 'It is all in one folder.', endLayout, {
  repo: 'https://github.com/moccadroid/niscorp',
  repoWords: 'github.com/moccadroid/niscorp',
  folder: 'apps/lab/lyceum',
});

export const LATER_SLIDES: readonly ActionDefinition[] = [
  mossSlide,
  charterSlide,
  twiceSlide,
  vexSlide,
  wordsSlide,
  waterSlide,
  pressSlide,
  tideSlide,
  onceSlide,
  strataSlide,
  endSlide,
];
