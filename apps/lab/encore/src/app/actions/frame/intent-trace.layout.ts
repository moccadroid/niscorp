import type { LayoutNode } from '@niscorp/nova';

export const XRAY_CHORD = 'mod+., mod+`';

const heading = (value: string): LayoutNode => ({ component: 'Text', props: { value, variant: 'title' } });

const lines = (path: string): LayoutNode => ({
  component: 'Stack',
  props: { gap: 4 },
  // No `key`: two story lines can be the same words, and keying by text makes React drop one.
  children: [{ for: path, as: 'line', do: { component: 'Text', props: { value: '$.line.text', tone: '$.line.tone', variant: 'story' } } }],
});

const meters = (path: string): LayoutNode => ({
  component: 'Stack',
  props: { gap: 4 },
  children: [{ for: path, as: 'card', key: 'id', do: { component: 'Meter', props: { label: '$.card.label', value: '$.card.p', note: '$.card.note', compact: true } } }],
});

const typed: LayoutNode = {
  component: 'Stack',
  props: { gap: 6 },
  children: [
    { component: 'Text', props: { value: '$.story.typed', variant: 'story' } },
    { if: '$.story.heard.length', then: { component: 'Tags', props: { prefix: 'Heard', items: '$.story.heard' } }, else: { component: 'Text', props: { value: 'Heard nothing it could name: no time, no row.', tone: 'mute', variant: 'story' } } },
    lines('$.story.corrections'),
  ],
};

const jev: LayoutNode = {
  component: 'Stack',
  props: { gap: 6 },
  children: [
    heading('$.story.jevHeading'),
    { component: 'Text', props: { value: 'How much it wanted each card on screen:', tone: 'mute', variant: 'story' } },
    { if: '$.allCards', then: meters('$.story.cards'), else: meters('$.story.cardsTop') },
    {
      if: '$.story.moreCards',
      then: { if: '$.allCards', then: { component: 'Button', ref: 'fewerCards', props: { label: 'show fewer', variant: 'link' } }, else: { component: 'Button', ref: 'allCards', props: { label: 'show all {{$.story.cards.length}}', variant: 'link' } } },
      else: '',
    },
    lines('$.story.decided'),
  ],
};

const handed: LayoutNode = {
  if: '$.story.handedHeading',
  then: { component: 'Stack', props: { gap: 6 }, children: [heading('$.story.handedHeading'), { component: 'KeyValue', props: { items: '$.story.handed' } }] },
  else: '',
};

const assistant: LayoutNode = {
  if: '$.story.assistantHeading',
  then: { component: 'Stack', props: { gap: 6 }, children: [heading('$.story.assistantHeading'), lines('$.story.assistant')] },
  else: '',
};

const screen: LayoutNode = { component: 'Stack', props: { gap: 6 }, children: [heading('On screen, as a result'), lines('$.story.screen')] };

const story: LayoutNode = {
  if: '$.story.key',
  then: { component: 'Stack', props: { gap: 16 }, children: [typed, jev, handed, assistant, screen] },
  else: { component: 'Text', props: { value: 'Nothing has been typed yet. The story of a sentence appears here as soon as there is one.', tone: 'mute', variant: 'story' } },
};

const numbers: LayoutNode = {
  if: '$.story.key',
  then: {
    component: 'Grid',
    props: { columns: 2, gap: 24, align: 'start' },
    children: [
      { component: 'Stack', props: { gap: 6 }, children: [heading('Where the time went'), { component: 'KeyValue', props: { items: '$.story.timings' } }] },
      { component: 'Stack', props: { gap: 6 }, children: [heading('What it cost'), { component: 'KeyValue', props: { items: '$.story.cost' } }] },
    ],
  },
  else: { component: 'Text', props: { value: 'No pass yet — nothing has been measured.', tone: 'mute', variant: 'story' } },
};

const demo: LayoutNode = {
  component: 'Stack',
  props: { gap: 8 },
  children: [
    { component: 'Text', props: { value: 'A scripted Saturday evening, written to the database by a separate principal — the room sees it the way it would see the real site.', tone: 'mute', variant: 'story' } },
    { component: 'CanvasSlot', props: { canvasId: 'deck' } },
  ],
};

const tab = (key: string, label: string): LayoutNode => ({
  if: { $eq: ['$.tab', key] },
  then: { component: 'Button', ref: `tab-${key}`, props: { label, variant: 'tab-on' } },
  else: { component: 'Button', ref: `tab-${key}`, props: { label, variant: 'tab' } },
});

export const TRACE_TABS = ['story', 'numbers', 'demo'] as const;

const stepper: LayoutNode = {
  if: '$.storyPosition',
  then: {
    component: 'Row',
    props: { gap: 6, align: 'center' },
    children: [
      { component: 'Button', ref: 'earlier', props: { label: '‹', variant: 'quiet', disabled: { $if: '$.hasEarlier', $then: false, $else: true } } },
      { component: 'Text', props: { value: '{{$.story.label}} · {{$.storyPosition}}', tone: 'mute', variant: 'story' } },
      { component: 'Button', ref: 'later', props: { label: '›', variant: 'quiet', disabled: { $if: '$.hasLater', $then: false, $else: true } } },
      { if: '$.following', then: '', else: { component: 'Button', ref: 'latest', props: { label: 'back to the latest', variant: 'link' } } },
    ],
  },
  else: '',
};

const panel: LayoutNode = {
  component: 'Box',
  props: { tone: 'dock', grow: true },
  children: [
    {
      component: 'Stack',
      props: { gap: 0 },
      children: [
        {
          component: 'Box',
          props: { px: 16, py: 8, tone: 'dock-head' },
          children: [
            {
              component: 'Row',
              props: { gap: 16, align: 'center', justify: 'between', wrap: true },
              children: [
                { component: 'Row', props: { gap: 4, align: 'center' }, children: [tab('story', 'What happened'), tab('numbers', 'Timings & cost'), tab('demo', 'Demo')] },
                stepper,
                { component: 'Button', ref: 'shut', props: { label: 'close x-ray', variant: 'quiet' } },
              ],
            },
          ],
        },
        {
          component: 'Box',
          props: { px: 16, py: 12, scroll: true, maxH: '44vh' },
          children: [{ if: { $eq: ['$.tab', 'numbers'] }, then: numbers, else: { if: { $eq: ['$.tab', 'demo'] }, then: demo, else: story } }],
        },
      ],
    },
  ],
};

export const intentTraceLayout: LayoutNode = {
  component: 'Row',
  props: { gap: 8, align: 'end', justify: 'end' },
  children: [
    { if: '$.open', then: { component: 'Hotkey', ref: 'shutKey', props: { value: XRAY_CHORD } }, else: { component: 'Hotkey', ref: 'openKey', props: { value: XRAY_CHORD } } },
    { component: 'OnLoad', ref: 'fresh', props: { when: '$.open' } },
    { if: '$.open', then: panel, else: { component: 'Button', ref: 'open', props: { label: 'x-ray', variant: 'quiet' } } },
  ],
};
