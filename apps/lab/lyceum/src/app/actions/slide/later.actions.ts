import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import {
  endLayout,
  incidentLayout,
  onceLayout,
  pressLayout,
  prismLayout,
  strataLayout,
  tideLayout,
  vexLayout,
  wordsLayout,
} from './later.layouts';

// AFTER MOSS AND CHARTER (./moss.actions.ts) — the rest of nisc, each part the
// same move in one more place: Vex (a query is
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

// The controller's Next button (speaker/console.prism.ts, as written): where
// the deck goes next, never past the last slide. Beside it, the same config, run by
// the layout on this slide over the deck as it is now.
export const prismSlide: ActionDefinition = {
  id: 'slide.prism',
  title: 'Functions are JSON too.',
  data: {
    kicker: 'Prism',
    title: 'Functions are JSON too.',
    file: 'console.prism.ts — my Next button',
    code: code(
      "const position = { $ref: '$.current.position' };",
      "const last = { $sub: [{ $ref: '$.current.count' }, 1] };",
      '',
      'export const deckNextPrism = {',
      '  fingerprint: deckGo.fingerprint,',
      '  context: {',
      "    deck: 'talk',",
      '    position: { $min: { over: [',
      '      { $add: [position, 1] }, last] } },',
      '  },',
      '};',
    ),
    marked: [8, 9],
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
  },
  layout: prismLayout,
  endpoints: { current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' } },
  lifecycle: { mount: [{ call: 'current' }] },
  triggers: [],
};

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
  code: code('{', '  "grammar": {', '    "lyceum.kit": 12,', '    "nisc.nova": 2,', '    "nisc.prism": 1', '  }', '}'),
});

export const endSlide = still('slide.end', 'It’s all in one folder.', endLayout, {
  repo: 'https://github.com/moccadroid/niscorp',
  repoWords: 'github.com/moccadroid/niscorp',
  folder: 'apps/lab/lyceum',
});

export const LATER_SLIDES: readonly ActionDefinition[] = [
  prismSlide,
  vexSlide,
  wordsSlide,
  waterSlide,
  pressSlide,
  tideSlide,
  onceSlide,
  strataSlide,
  endSlide,
];
