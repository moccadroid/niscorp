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

export const mossSlide = still('slide.moss', 'Your screen runs on the server.', mossLayout, {
  kicker: 'Moss',
  from: 'Server',
  to: 'Your phone',
  lanes: [
    { label: 'What to draw', toward: 'to', ink: 'signal' },
    { label: 'What you pressed', toward: 'from', ink: 'alert' },
  ],
});

// Two roles from app/charter/charter.ts, as written.
export const charterSlide = still('slide.charter', 'Who gets what: one file.', documentLayout, {
  kicker: 'Charter',
  file: 'charter.ts',
  code: code(
    'member: {',
    "  actions: ['member.*', 'query.*',",
    "    'assistant.*', 'ext.member.*'],",
    '  data: [...MEMBERS_READ, ...QUERYING,',
    '    ...QUESTIONING, ...CONVERSING, ...LOOK],',
    '},',
    '',
    "clock: { data: ['deck.write.update'] },",
  ),
  marked: [8],
});

// The questions rule from app/vex/behaviors.ts.
export const twiceSlide = still('slide.twice', 'Enforced twice.', twiceLayout, {
  shell: 'Only what you’re given.',
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
export const vexSlide = still('slide.vex', 'Queries are JSON too.', vexLayout, {
  kicker: 'Vex',
  file: 'Stored',
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
  kicker: 'Vex',
  outcomes: [
    { area: 'again', ink: 'live', label: 'Asked before', what: 'Replayed' },
    { area: 'new', ink: 'signal', label: 'New', what: 'Written, stored' },
    { area: 'cannot', ink: 'paper', label: 'Not allowed', what: 'Refused' },
  ],
});

export const waterSlide = still('slide.water', '18,000 cups of water.', incidentLayout, {
  kicker: 'Taco Bell’s AI drive-through, 2025',
});

export const pressSlide = still('slide.press', 'It can’t press Send.', pressLayout, {
  can: [{ text: 'Reads your screen' }, { text: 'Fills in forms' }],
});

// The timer saved at the start of the talk, read as the stage: the row's
// reflex document, printed, and when it fires.
export const tideSlide: ActionDefinition = {
  id: 'slide.tide',
  title: 'The timer is a row.',
  data: { kicker: 'Tide', title: 'The timer is a row.', timer: { code: '', marked: [], due_at: '' } },
  layout: tideLayout,
  endpoints: { timer: { fn: 'room.timer', target: 'timer' } },
  lifecycle: { mount: [{ call: 'timer' }] },
  triggers: [],
};

export const onceSlide = still('slide.once', 'No agent loop.', onceLayout, {});

// This app's strata.lock.json, as committed.
export const strataSlide = still('slide.strata', 'Grammars get migrations.', strataLayout, {
  kicker: 'Strata',
  file: 'strata.lock.json',
  code: code('{', '  "grammar": {', '    "lyceum.kit": 10,', '    "nisc.nova": 2,', '    "nisc.prism": 1', '  }', '}'),
});

export const endSlide = still('slide.end', 'It’s all in one folder.', endLayout, {
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
