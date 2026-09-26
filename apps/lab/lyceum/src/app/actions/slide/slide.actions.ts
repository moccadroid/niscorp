import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { liveSlideLayout, slideLayout } from './slide.layouts';

// THE SLIDES. Each is an action only the stage holds; the deck (`slides` rows)
// decides which is on screen and in what order. Their words are provisional —
// the talk's text is written with the story (PLAN.md, Open).

const slide = (id: string, words: { kicker: string; title: string; lines: string[] }): ActionDefinition => ({
  id,
  title: words.title,
  data: words,
  layout: slideLayout,
  triggers: [],
});

export const titleSlide = slide('slide.title', {
  kicker: 'Lyceum',
  title: 'The talk is an application',
  lines: ['Everything you will see tonight is running — not a recording, not a mock-up.', 'Take your phone out.'],
});

export const dataSlide = slide('slide.data', {
  kicker: 'How it is built',
  title: 'Everything is data',
  lines: [
    'A screen is JSON. A query is JSON. A permission is JSON.',
    'Models write structure, never code.',
    'What is data can be checked, cached, compared — and shown to you.',
  ],
});

export const existenceSlide = slide('slide.existence', {
  kicker: 'Look at your phone',
  title: 'What you hold exists',
  lines: ['Your phone shows only what the charter gives you.', 'Not hidden. Not disabled. Absent.'],
});

// Live: the room counted as it changes. Nobody tells this slide anything —
// its read answers again whenever somebody steps in or is sorted.
export const liveSlide: ActionDefinition = {
  id: 'slide.live',
  title: 'Nobody announced anything',
  data: {
    kicker: 'Watch the numbers',
    title: 'Nobody announced anything',
    lines: ['Every screen that shows the room follows it on its own.', 'No channel, no listener — the query knows what it reads.'],
    counts: { joined: 0, sorted: 0 },
  },
  layout: liveSlideLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [],
};

export const endSlide = slide('slide.end', {
  kicker: 'apps/lab/lyceum',
  title: 'It is all in the folder',
  lines: ['Everything you saw tonight was live, and it is all in there.'],
});

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [titleSlide, dataSlide, existenceSlide, liveSlide, endSlide];
