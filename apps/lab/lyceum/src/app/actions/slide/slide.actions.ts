import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { codeLayout, liveLayout, statementLayout, titleLayout } from './slide.layouts';

// THE SLIDES. Each is an action only the stage holds; the deck (`slides` rows)
// decides which is on screen and in what order. A slide's words are its data;
// its layout is one of a few shapes. The words are provisional — the talk's
// text is written with the story (PLAN.md, Open).

const counted: Record<string, EndpointConfig> = {
  counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
};
const COUNTS = { joined: 0, sorted: 0, unsorted: 0 };

export const titleSlide: ActionDefinition = {
  id: 'slide.title',
  title: 'The talk is an application',
  data: {
    kicker: 'Lyceum — tonight',
    title: 'The talk is an application',
    lines: ['Everything you will see tonight is running — not a recording, not a mock-up.', 'Take your phone out.'],
    counts: COUNTS,
  },
  layout: titleLayout,
  endpoints: counted,
  lifecycle: { mount: [{ call: 'counts' }] },
  triggers: [],
};

export const dataSlide: ActionDefinition = {
  id: 'slide.data',
  title: 'Everything is data',
  data: {
    kicker: 'How it is built',
    title: 'Everything is data',
    file: 'member.card.action.ts',
    code: [
      "{ id: 'member.card',",
      '  data: { me: {}, loading: true },',
      '  endpoints: { load: {',
      "    request: { fingerprint: 'members/me' },",
      "    target: 'me' } },",
      "  layout: { component: 'Sheet',",
      "    areas: ['kick', 'name', 'status'],",
      '    children: [ … ] } }',
    ].join('\n'),
    marked: [4, 7],
    lines: [
      'The card on your phone is this object. No component knows who you are; the screen is data, and so is the query behind it.',
      'A screen is JSON · A query is JSON · A permission is JSON',
    ],
  },
  layout: codeLayout,
  triggers: [],
};

export const existenceSlide: ActionDefinition = {
  id: 'slide.existence',
  title: 'What you hold exists',
  data: {
    kicker: 'Look at your phone',
    title: 'What you hold exists',
    points: [
      { label: '01 · Ring one', text: 'An action you are not granted is never sent to your phone. Not hidden, not disabled — absent.' },
      { label: '02 · Ring two', text: 'An action you hold may come in your variant. Your house is a mark, not a different screen.' },
      { label: '03 · Ring three', text: 'Every query runs under your policy. The same question answers you and me differently.' },
    ],
  },
  layout: statementLayout,
  triggers: [],
};

// Live: the room counted as it changes. Nobody tells this slide anything —
// its read answers again whenever somebody steps in or is sorted.
export const liveSlide: ActionDefinition = {
  id: 'slide.live',
  title: 'Nobody announced anything',
  data: {
    kicker: 'Watch the numbers',
    title: 'Nobody announced anything',
    lines: ['Every screen that shows the room follows it on its own — no channel, no listener. The query knows what it reads.'],
    counts: COUNTS,
  },
  layout: liveLayout,
  endpoints: counted,
  lifecycle: { mount: [{ call: 'counts' }] },
  triggers: [],
};

export const endSlide: ActionDefinition = {
  id: 'slide.end',
  title: 'It is all in the folder',
  data: {
    kicker: 'apps/lab/lyceum',
    title: 'It is all in the folder',
    points: [
      { label: 'Live', text: 'Everything you saw tonight was running, on this server, as you watched.' },
      { label: 'Data', text: 'Every screen, query and permission is a file you can read.' },
      { label: 'Yours', text: 'Open it. Change a slide. It is the same thing the room just used.' },
    ],
  },
  layout: statementLayout,
  triggers: [],
};

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [titleSlide, dataSlide, existenceSlide, liveSlide, endSlide];
