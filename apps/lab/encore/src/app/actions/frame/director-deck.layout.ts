import type { LayoutNode } from '@niscorp/nova';

// A row of controls, small on purpose: it is the projectionist's booth, not the
// film.
// DEMO TOOLING, so it is x-ray's: absent from the app's tree.
const deck: LayoutNode = {
  component: 'Row',
  props: { gap: 10, align: 'center', wrap: true },
  children: [
    { component: 'Text', props: { value: 'director', variant: 'label', tone: 'mute' } },
    { component: 'Text', props: { value: '{{$.deck.day}} {{$.deck.time}}', variant: 'mono' } },
    // What it is doing, in a word: ready · playing · paused · finished.
    { component: 'Badge', props: { label: '$.deck.status', tone: { $if: '$.deck.finished', $then: 'good', $else: 'mute' } } },
    {
      if: '$.deck.playing',
      then: { component: 'Button', ref: 'pause', props: { label: 'pause', variant: 'ghost' } },
      else: { if: '$.deck.finished', then: { component: 'Button', ref: 'replay', props: { label: 'replay', variant: 'ghost' } }, else: { component: 'Button', ref: 'play', props: { label: 'play', variant: 'ghost' } } },
    },
    { component: 'Button', ref: 'slower', props: { label: 'slower', variant: 'ghost' } },
    { component: 'Text', props: { value: '{{$.deck.speed}}×', variant: 'mono', tone: 'mute' } },
    { component: 'Button', ref: 'faster', props: { label: 'faster', variant: 'ghost' } },
    { component: 'Text', props: { value: '{{$.deck.played}} of {{$.deck.of}} cues', variant: 'tag', tone: 'mute' } },
  ],
};

// THE APP keeps one tiny handle — somebody has to be able to start the evening
// without opening the instruments — and nothing else: no clock, no cue count, no
// speed. The deck proper is x-ray's.
const handle: LayoutNode = {
  if: '$.deck.playing',
  then: { component: 'Button', ref: 'pause', props: { label: 'demo ❙❙', variant: 'quiet' } },
  else: { if: '$.deck.finished', then: { component: 'Button', ref: 'replay', props: { label: 'demo ↺', variant: 'quiet' } }, else: { component: 'Button', ref: 'play', props: { label: 'demo ▸', variant: 'quiet' } } },
};

export const directorDeckLayout: LayoutNode = { if: '$.xray', then: deck, else: handle };
