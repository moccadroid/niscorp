import type { LayoutNode } from '@niscorp/nova';

// The slides' layouts: the one grammar at two registers — one loud thing per
// slide (a display headline or a figure), everything else at reading size.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });

// The title: the claim, the room counted beside it, one line to act on.
export const titleLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    size: 'fill',
    areas: ['kick kick kick count', 'head head head count', 'body body cta count'],
    cols: [1, 1, 1, 1.1],
    rows: ['auto', 1, 'auto'],
  },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('body', [{ component: 'Text', children: '{{$.lines.0}}' }]),
    cell('cta', [{ component: 'Text', children: '{{$.lines.1}}' }], { ink: 'alert' }),
    cell('count', [{ component: 'Figure', props: { label: 'In the room', value: '$.counts.joined' } }], { ink: 'live', align: 'end' }),
  ],
};

// A statement: the claim, then its points as numbered cells. The points are
// placed by the grid itself, one cell each, in the row under the headline.
export const statementLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head'], rows: ['auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    {
      for: '$.points',
      as: 'point',
      do: { component: 'Cell', children: [label('{{$point.label}}'), { component: 'Text', children: '{{$point.text}}' }] },
    },
  ],
};

// Words beside code: the claim and a sentence on the left, the artifact it is
// about on the right, the lines that matter marked.
export const codeLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick code', 'head code', 'body code', 'tags tags'], cols: [1, 1.25], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'title' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('body', [{ component: 'Text', children: '{{$.lines.0}}' }]),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink' }),
    cell('tags', [label('{{$.lines.1}}')], { ink: 'highlight' }),
  ],
};

// The room, counted, live: two figures, a bar, and what it means.
export const liveLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'joined sorted words', 'bar bar bar'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('joined', [{ component: 'Figure', props: { label: 'In the room', value: '$.counts.joined' } }], { ink: 'live' }),
    cell('sorted', [{ component: 'Figure', props: { label: 'Sorted', value: '$.counts.sorted' } }], { ink: 'signal' }),
    cell('words', [
      { component: 'Text', children: '{{$.counts.joined}} in the room · {{$.counts.sorted}} sorted' },
      { component: 'Text', props: { tone: 'muted' }, children: '{{$.lines.0}}' },
    ]),
    cell('bar', [{ component: 'Bar', props: { segments: [{ value: '$.counts.sorted', ink: 'signal' }, { value: '$.counts.unsorted', mark: 'hatch' }] } }], { pad: 'none' }),
  ],
};
