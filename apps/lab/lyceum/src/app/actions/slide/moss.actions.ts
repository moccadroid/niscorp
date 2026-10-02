import type { ActionDefinition } from '@niscorp/nova';
import { deckStep } from '@lyceum/app/vex/deck.entries';
import { pressesRecent } from '@lyceum/app/vex/press.entries';
import { documentLayout, mossLayout, twiceLayout } from './later.layouts';
import { buttonLayout, claimLayout, pairLayout, placesLayout } from './moss.layouts';

// MOSS AND CHARTER — how a screen got onto a phone, and who decides which.
// Moss: each person's screen runs on the server, the phone draws it; the
// server is a list of documents, and it sends each person only what exists for
// them. Then the room sees it: three people are given an action nobody else is
// sent. Charter is how that was decided: one file instead of checks in three
// places, enforced in the screen and in every query, and the same for a model.

const code = (...lines: string[]): string => lines.join('\n');

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

export const mossSlide = still('slide.moss', 'Your screen runs on the server.', claimLayout, {
  kicker: 'Moss',
  side: { label: 'Type something, then', word: 'Reload', ink: 'signal' },
});

export const wireSlide = still('slide.wire', 'Your phone only draws.', mossLayout, {
  kicker: 'Moss',
  from: 'Server',
  to: 'Your phone',
  lanes: [
    { label: 'What to draw', toward: 'to', ink: 'signal' },
    { label: 'What you pressed', toward: 'from', ink: 'alert' },
  ],
});

// app/app.ts, as written: what this app hands Moss.
export const manifestSlide = still('slide.manifest', 'The server is a list.', documentLayout, {
  kicker: 'Moss',
  file: 'app.ts',
  code: code(
    'defineApp({',
    '  charter: CHARTER,',
    '  wearable: WEARABLE,',
    '  actions: ACTIONS,',
    '  entries: ENTRIES,',
    '  behaviors: BEHAVIORS,',
    '  grammars: [LYCEUM_KIT],',
    '  attachable: ATTACHABLE,',
    '  identity: seams.identity,',
    '  …',
    '  shell: { canvases: CANVASES, … },',
    '});',
  ),
  marked: [2, 4, 5, 6],
});

export const existsSlide = still('slide.exists', 'It sends you only what you have.', pairLayout, {
  kicker: 'Moss',
  one: { label: 'A usual server', line: 'One app. Checks around it.' },
  two: { label: 'Moss', line: 'Your app. Nothing else is sent.' },
});

// Who pressed, live: a reactive read, so a press is on the stage on its own.
export const buttonSlide: ActionDefinition = {
  id: 'slide.button',
  title: 'Some of you have an action now.',
  data: { title: 'Some of you have an action now.', presses: [] },
  layout: buttonLayout,
  endpoints: { presses: { url: '/api/vex', method: 'POST', request: { fingerprint: pressesRecent.fingerprint, context: {} }, target: 'presses' } },
  lifecycle: { mount: [{ call: 'presses' }] },
  triggers: [],
};

// Where permissions are usually checked — three places — and, a step on, the
// one file they are here: three roles from app/charter/charter.ts, as written.
export const whereSlide: ActionDefinition = {
  id: 'slide.where',
  title: 'Where do you check permissions?',
  data: {
    title: 'Where do you check permissions?',
    places: [
      { area: 'one', name: 'Routes', what: 'An address' },
      { area: 'two', name: 'Components', what: 'A hidden button' },
      { area: 'three', name: 'Rows', what: 'Row-level security' },
    ],
    kicker: 'Charter',
    answer: 'Here: one file.',
    file: 'charter.ts',
    code: code(
      'member: {',
      "  actions: ['member.*', 'query.*',",
      "    'ext.member.*'],",
      '  data: [...MEMBERS_READ, ...QUERYING,',
      '    ...QUESTIONING, ...CONVERSING, ...LOOK],',
      '},',
      '',
      'button: {',
      "  actions: ['button.*'],",
      "  data: ['presses.write.insert'],",
      '},',
      '',
      "clock: { data: ['deck.write.update'] },",
    ),
    marked: [8, 9, 10, 11],
    step: { step: 0 },
  },
  layout: placesLayout,
  endpoints: { step: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' } },
  lifecycle: { mount: [{ call: 'step' }] },
  triggers: [],
};

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

export const agentsSlide = still('slide.agents', 'The same file governs the AI.', pairLayout, {
  kicker: 'Charter',
  one: { label: 'Your assistant', line: 'Opens only your actions.' },
  two: { label: 'The timer', line: 'Runs as clock. It can move the slide.' },
});

export const MOSS_SLIDES: readonly ActionDefinition[] = [mossSlide, wireSlide, manifestSlide, existsSlide, buttonSlide, whereSlide, twiceSlide, agentsSlide];
