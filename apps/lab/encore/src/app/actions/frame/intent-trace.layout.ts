import type { LayoutNode } from '@niscorp/nova';

// THE INSTRUMENT IS A DRAWER, AND IT IS LAYER THREE. With x-ray off it renders
// NOTHING — not hidden, not collapsed: absent from the tree the terminal is
// sent. With it on, five sections, each ONE LINE until somebody opens it:
//
//   Pass · Decision · Handoff · Run · Probabilities
//
// A section's summary is a sentence the loop wrote (`summary.pass`: "Pass 10 ·
// 348 ms · 40 questions"); what is open is this card's own data (`open_pass`),
// which the loop never writes — so it survives every pass and every sentence.
//
// Before the first pass there is nothing to measure, and a strip of zeros ending
// in "calibrated false" reads as a fault: the drawer says so in one muted line.

const section = (key: string, title: string, body: LayoutNode): LayoutNode => ({
  component: 'Stack',
  props: { gap: 4 },
  children: [
    {
      component: 'Row',
      props: { gap: 10, align: 'center', wrap: true },
      children: [
        { if: `$.open_${key}`, then: { component: 'Button', ref: `close-${key}`, props: { label: `▾ ${title}`, variant: 'quiet' } }, else: { component: 'Button', ref: `open-${key}`, props: { label: `▸ ${title}`, variant: 'quiet' } } },
        { component: 'Text', props: { value: `$.summary_${key}`, variant: 'mono', tone: 'mute' } },
      ],
    },
    { if: `$.open_${key}`, then: body, else: '' },
  ],
});

export const TRACE_SECTIONS = ['pass', 'decision', 'handoff', 'run', 'probabilities'] as const;

const drawer: LayoutNode = {
  component: 'Stack',
  props: { gap: 2 },
  children: [
    section('pass', 'Pass', {
      component: 'KeyValue',
      props: {
        inline: true,
        items: [
          { label: 'pass', value: '$.pass' },
          { label: 'total ms', value: '$.totalMs' },
          { label: 'waited ms', value: '$.waitedMs' },
          { label: 'connection', value: '$.connection' },
          { label: 'pre-warm', value: '$.warm' },
        ],
      },
    }),
    section('decision', 'Decision', {
      component: 'Stack',
      props: { gap: 6 },
      children: [
        {
          component: 'KeyValue',
          props: {
            inline: true,
            items: [
              { label: 'questions', value: '$.questions' },
              { label: 'bytes', value: '$.bytes' },
              { label: 'decider', value: '$.decider' },
              { label: 'calibrated', value: '$.calibrated' },
            ],
          },
        },
        { component: 'KeyValue', props: { inline: true, items: '$.lanes' } },
      ],
    }),
    section('handoff', 'Handoff', { component: 'KeyValue', props: { inline: true, items: '$.handoff' } }),
    section('run', 'Run', { component: 'KeyValue', props: { inline: true, items: '$.run' } }),
    section('probabilities', 'Probabilities', {
      component: 'Row',
      props: { gap: 10, wrap: true },
      children: [{ for: '$.top', as: 'entry', key: 'id', do: { component: 'Meter', props: { label: '$.entry.id', value: '$.entry.p', compact: true } } }],
    }),
  ],
};

export const intentTraceLayout: LayoutNode = {
  if: '$.xray',
  then: {
    component: 'Box',
    props: { tone: 'sunken', pad: 10 },
    children: [{ if: '$.pass', then: drawer, else: { component: 'Text', props: { value: 'no sentence yet — the instrument reads from the first pass', variant: 'tag', tone: 'mute' } } }],
  },
  else: '',
};
