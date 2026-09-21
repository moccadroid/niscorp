import type { LayoutNode } from '@niscorp/nova';

// X-RAY IS ONE PANEL, DOCKED AT THE BOTTOM, AND NOTHING ELSE.
//
// The first x-ray turned the whole room into an instrument — probability tags on
// every card, a legend row, a banner, a status line under the answer — and the
// one interesting thing, two models talking to each other, was five collapsed
// key/value grids in lowercase mono. The rule now: X-RAY CHANGES NOTHING IN THE
// APP. Every app canvas is byte-identical with it on and off; all of it is here.
//
// Shut, this is one quiet word. Open, it is a panel with a fixed ceiling and its
// own scroll, sitting IN the page's flow at its end and stuck to the bottom of
// the window — so the page is exactly one panel longer, and the last card can
// always be scrolled clear of it. "On" is the panel being open; nothing else says so.
//
// THE STORY FIRST (server/intent/story.ts): a short sequence in the reading
// face — what was typed, what Jev decided, what the assistant was handed, what it
// said and what was refused, what changed on screen. NUMBERS SECOND: one table,
// real labels, each once. The demo's controls third. Mono is for ids and numbers.

export const XRAY_CHORD = 'mod+., mod+`';

const heading = (value: string): LayoutNode => ({ component: 'Text', props: { value, variant: 'title' } });

const lines = (path: string): LayoutNode => ({
  component: 'Stack',
  props: { gap: 4 },
  children: [{ for: path, as: 'line', key: 'text', do: { component: 'Text', props: { value: '$.line.text', tone: '$.line.tone', variant: 'story' } } }],
});

const meters = (path: string): LayoutNode => ({
  component: 'Stack',
  props: { gap: 4 },
  children: [{ for: path, as: 'card', key: 'id', do: { component: 'Meter', props: { label: '$.card.label', value: '$.card.p', note: '$.card.note', compact: true } } }],
});

// 1 — what was typed, and what was heard in it.
const typed: LayoutNode = {
  component: 'Stack',
  props: { gap: 6 },
  children: [
    { component: 'Text', props: { value: '$.story.typed', variant: 'story' } },
    { if: '$.story.heard.length', then: { component: 'Tags', props: { prefix: 'Heard', items: '$.story.heard' } }, else: { component: 'Text', props: { value: 'Heard nothing it could name: no time, no row.', tone: 'mute', variant: 'story' } } },
    lines('$.story.corrections'),
  ],
};

// 2 — Jev: the cards it wanted (a bar and a number), then the decision in words.
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

// 3 — what the assistant was handed.
const handed: LayoutNode = {
  if: '$.story.handedHeading',
  then: { component: 'Stack', props: { gap: 6 }, children: [heading('$.story.handedHeading'), { component: 'KeyValue', props: { items: '$.story.handed' } }] },
  else: '',
};

// 4 — the assistant: what it said, placed, looked up — and what was refused, with why.
const assistant: LayoutNode = {
  if: '$.story.assistantHeading',
  then: { component: 'Stack', props: { gap: 6 }, children: [heading('$.story.assistantHeading'), lines('$.story.assistant')] },
  else: '',
};

// 5 — what changed on screen as a result.
const screen: LayoutNode = { component: 'Stack', props: { gap: 6 }, children: [heading('On screen, as a result'), lines('$.story.screen')] };

const story: LayoutNode = {
  if: '$.story.key',
  then: { component: 'Stack', props: { gap: 16 }, children: [typed, jev, handed, assistant, screen] },
  else: { component: 'Text', props: { value: 'Nothing has been typed yet. The story of a sentence appears here as soon as there is one.', tone: 'mute', variant: 'story' } },
};

// NUMBERS SECOND: one table of where the time went, one of what it cost.
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

// The demo: the director's own deck, which is its own action on its own canvas
// (a principal who does not hold it gets an empty slot, and the line under it).
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

// Which pass this is, and the way to the ones before it.
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
    // Ctrl+. (or Ctrl+`) is the same switch, either way round — a CHORD, because the
    // line always has focus and a bare backtick is a character in the sentence (kit
    // `Hotkey`, chords.ts). And a freshly loaded page that finds the panel open shuts
    // it (kit `OnLoad`: once per page load).
    { if: '$.open', then: { component: 'Hotkey', ref: 'shutKey', props: { value: XRAY_CHORD } }, else: { component: 'Hotkey', ref: 'openKey', props: { value: XRAY_CHORD } } },
    { component: 'OnLoad', ref: 'fresh', props: { when: '$.open' } },
    { if: '$.open', then: panel, else: { component: 'Button', ref: 'open', props: { label: 'x-ray', variant: 'quiet' } } },
  ],
};
