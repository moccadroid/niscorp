import type { LayoutNode } from '@niscorp/nova';

// A row of controls, small on purpose: it is the projectionist's booth, not the
// film.
// DEMO TOOLING: it lives in x-ray's panel, under "Demo", and nowhere in the app.
const deck: LayoutNode = {
  component: 'Row',
  props: { gap: 10, align: 'center', wrap: true },
  children: [
    { component: 'Text', props: { value: 'Festival clock: {{$.deck.day}} {{$.deck.time}}', variant: 'story' } },
    { component: 'Badge', props: { label: '$.deck.status', tone: { $if: '$.deck.finished', $then: 'good', $else: 'mute' } } },
    {
      if: '$.deck.playing',
      then: { component: 'Button', ref: 'pause', props: { label: 'Pause', variant: 'ghost' } },
      else: { if: '$.deck.finished', then: { component: 'Button', ref: 'replay', props: { label: 'Replay', variant: 'ghost' } }, else: { component: 'Button', ref: 'play', props: { label: 'Play', variant: 'ghost' } } },
    },
    { component: 'Button', ref: 'slower', props: { label: 'Slower', variant: 'quiet' } },
    { component: 'Text', props: { value: '{{$.deck.speed}}× speed', tone: 'mute', variant: 'story' } },
    { component: 'Button', ref: 'faster', props: { label: 'Faster', variant: 'quiet' } },
    { component: 'Text', props: { value: '{{$.deck.played}} of {{$.deck.of}} cues played', tone: 'mute', variant: 'story' } },
  ],
};

// Drawn inside x-ray's panel, under "Demo" (frame/intent-trace.layout.ts): the
// app has no demo controls of its own.
export const directorDeckLayout: LayoutNode = { if: '$.shown', then: deck, else: '' };
