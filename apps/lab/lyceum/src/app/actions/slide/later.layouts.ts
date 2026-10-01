import type { LayoutNode } from '@niscorp/nova';

// THE LATER SECTIONS' LAYOUTS — Moss and Charter, Vex, the assistant, Tide,
// Strata, the close. Each designed for its one claim and its one picture.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const code = (textAt: string, markedAt?: string): LayoutNode => ({ component: 'Code', props: { text: textAt, ...(markedAt !== undefined ? { marked: markedAt } : {}) } });

// Moss: the claim, and under it, across the whole slide, what moves between
// your shell on the server and your phone — the dots never stop.
export const mossLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'flow'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell(
      'flow',
      [{ component: 'Flow', props: { from: '$.from', to: '$.to', lanes: '$.lanes' } }],
      { ink: 'signal' },
    ),
  ],
};

// A document under its claim: the claim across the top, the package's name in
// blue, and the real source beside it on ink, the lines that matter marked.
export const documentLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'name code'], cols: [1, 1.6], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('name', [headline('title', '{{$.kicker}}')], { ink: 'signal', align: 'center' }),
    cell('code', [label('{{$.file}}'), code('$.code', '$.marked')], { ink: 'ink', align: 'middle' }),
  ],
};

// Enforced in two places: the shell (which actions exist) and the engine
// (which rows a query reaches), each with what it looks like.
export const twiceLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'shell query'], cols: [1, 1.2], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('shell', [label('1 · Your screen'), headline('title', '{{$.shell}}')], { ink: 'alert', align: 'middle' }),
    cell('query', [label('2 · Every query'), headline('title', 'Only your rows.'), code('$.code', '$.marked')], { ink: 'signal', align: 'middle' }),
  ],
};

// Vex: what is stored, big, and what a screen sends to use it, small — the
// difference in size is the point.
export const vexLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'stored sent'], cols: [1.5, 1], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]),
    cell('stored', [label('{{$.file}}'), code('$.stored', '$.marked')], { ink: 'ink', align: 'middle' }),
    cell('sent', [label('Sent'), code('$.sent')], { ink: 'highlight', align: 'middle' }),
  ],
};

// Asked in words: the question, and the three things that can come of it.
export const wordsLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head head', 'again new cannot'], rows: [1, 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')], { align: 'middle' }),
    {
      for: '$.outcomes',
      as: 'outcome',
      key: 'area',
      do: {
        component: 'Cell',
        props: { area: '$outcome.area', ink: '$outcome.ink', align: 'center' },
        children: [label('{{$outcome.label}}'), headline('title', '{{$outcome.what}}')],
      },
    },
  ],
};

// A number that happened, and where.
export const incidentLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head'], rows: ['auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { ink: 'alert', align: 'center' }),
  ],
};

// It prepares, you press: what the model may do, and the one thing it may not.
export const pressLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'can cannot'], cols: [1.3, 1], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('can', [label('Assistant'), { for: '$.can', as: 'line', do: headline('title', '{{$line.text}}') }], { align: 'middle' }),
    cell('cannot', [label('Only you'), headline('display', 'Send')], { ink: 'alert', align: 'center' }),
  ],
};

// Tide: the timer saved at the start of the talk, as it is stored, and how
// long until it fires.
export const tideLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick doc', 'head doc', 'left doc'], cols: [1, 1.15], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('left', [{ component: 'Countdown', props: { label: 'Fires in', to: '$.timer.due_at' } }], { ink: 'live' }),
    cell(
      'doc',
      [
        label('The row'),
        { if: '$.timer.code', then: code('$.timer.code', '$.timer.marked'), else: text('No timer saved yet.') },
      ],
      { ink: 'ink', align: 'middle' },
    ),
  ],
};

// Two ways to automate, one above the other: the agent's on paper, the
// reflex's in green.
export const onceLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'agent reflex'], cols: [1, 1.2], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('agent', [label('Agent + skill'), headline('title', 'A model, every run.')], { align: 'middle' }),
    cell('reflex', [label('This timer'), headline('title', 'No model.')], { ink: 'live', align: 'middle' }),
  ],
};

// Strata: the claim, and this source's own record of which grammar versions
// it is written in.
export const strataLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick lock', 'head lock', 'head read'], cols: [1.2, 1], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')], { align: 'middle' }),
    cell('lock', [label('{{$.file}}'), code('$.code')], { ink: 'ink', align: 'middle' }),
    cell('read', [label('Stored documents'), headline('title', 'Upgraded when read.')], { ink: 'signal' }),
  ],
};

// The end: where it all is — the public repository, as a code to scan and in
// words, and the folder this app is in — and where the questions go. Under
// that, whatever an integration attached to this slide (`attached`, the
// stage's): Acme's list of the questions found fit to show, once installed.
export const endLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head where', 'head ask'], cols: [1.4, 1], rows: [1, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('where', [label('Open source'), { component: 'Qr', props: { value: '$.repo' } }, code('$.repoWords'), code('$.folder')], { ink: 'ink' }),
    cell('ask', [label('Questions'), headline('title', 'On your phone, in Acme.'), { component: 'CanvasSlot', props: { canvasId: 'attached' } }], { ink: 'signal', scroll: 'y' }),
  ],
};
