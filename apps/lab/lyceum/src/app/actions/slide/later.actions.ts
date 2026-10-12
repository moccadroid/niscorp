import type { ActionDefinition } from '@niscorp/nova';
import { LYCEUM_KIT } from '@lyceum/app/grammars';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { memberCounts } from '@lyceum/app/vex/member.entries';
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

const code = (...lines: string[]): string => lines.join('\n');

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

export const prismSlide: ActionDefinition = {
  id: 'slide.prism',
  title: 'Data mapping is JSON too.',
  data: {
    kicker: 'Prism',
    title: 'Data mapping is JSON too.',
    file: 'console.prism.ts — my Next button, before its write',
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

export const vexSlide: ActionDefinition = {
  id: 'slide.vex',
  title: 'Queries are JSON too.',
  layout: vexLayout,
  endpoints: { answer: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'answer' } },
  lifecycle: { mount: [{ call: 'answer' }] },
  triggers: [],
  data: {
  title: 'Queries are JSON too.',
  answer: { joined: 0 },
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
  },
};

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

export const strataSlide = still('slide.strata', 'Grammars get migrations.', strataLayout, {
  kicker: 'Strata',
  file: 'grammars.ts — every change to this app’s components, in order',
  migrations: LYCEUM_KIT.migrations.map((migration, index) => ({ n: index + 1, what: migration.description })),
  code: LYCEUM_KIT.migrations.map((migration, index) => `${String(index + 1).padStart(2, ' ')}  ${migration.description}`).join('\n'),
  marked: LYCEUM_KIT.migrations.flatMap((migration, index) => (migration.steps.length > 0 ? [index + 1] : [])),
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
