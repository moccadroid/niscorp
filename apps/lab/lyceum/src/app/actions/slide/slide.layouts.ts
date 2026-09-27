import type { LayoutNode } from '@niscorp/nova';

// The slides' layouts: the one grammar at two registers — one loud thing per
// slide (a display headline or a figure), everything else at reading size.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });

// The title: the claim, the way in beside it — the code to scan and the
// address to type — the room counted under it, one line to act on.
export const titleLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    size: 'fill',
    areas: ['kick kick kick join', 'head head head join', 'body body cta count'],
    // the code is the one thing on this slide somebody at the back must read
    cols: [1, 1, 1, 1.5],
    rows: ['auto', 1, 'auto'],
  },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('body', [{ component: 'Text', children: '{{$.lines.0}}' }]),
    cell('cta', [{ component: 'Text', children: '{{$.lines.1}}' }], { ink: 'alert' }),
    cell('join', [label('Scan to step in'), { component: 'Qr', props: { value: '$.address.url' } }, { component: 'Headline', props: { level: 'name' }, children: '{{$.address.host}}' }]),
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
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'joined assigned words', 'bar bar bar'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('joined', [{ component: 'Figure', props: { label: 'In the room', value: '$.counts.joined' } }], { ink: 'live' }),
    cell('assigned', [{ component: 'Figure', props: { label: 'Assigned', value: '$.counts.assigned' } }], { ink: 'signal' }),
    cell('words', [
      { component: 'Text', children: '{{$.counts.joined}} in the room · {{$.counts.assigned}} assigned' },
      { component: 'Text', props: { tone: 'muted' }, children: '{{$.lines.0}}' },
    ]),
    cell('bar', [{ component: 'Bar', props: { segments: [{ value: '$.counts.assigned', ink: 'signal' }, { value: '$.counts.unassigned', mark: 'hatch' }] } }], { pad: 'none' }),
  ],
};

// Queries from words, counted by how they were answered. Counts only — the
// requests were written by people and do not go up on the wall.
export const querySlideLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'replayed generated refused', 'words words words'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('replayed', [{ component: 'Figure', props: { label: 'Replayed — no model', value: '$.tally.replayed' } }], { ink: 'live' }),
    cell('generated', [{ component: 'Figure', props: { label: 'Written by a model', value: '$.tally.generated' } }], { ink: 'signal' }),
    cell('refused', [{ component: 'Figure', props: { label: 'Refused', value: '$.tally.refused' } }], { mark: 'hatch' }),
    cell('words', [{ component: 'Text', children: '{{$.lines.0}}' }, { component: 'Text', props: { tone: 'muted' }, children: '{{$.lines.1}}' }]),
  ],
};

// Assignment: a block per department — its mark, its sigil, its name —
// placed by the grid in the row under the headline; then how many each has so
// far, filling in as the speaker assigns the room.
export const assignmentLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick kick', 'head head head head', 'words words tally tally'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('words', [
      { component: 'Text', children: '{{$.lines.0}}' },
      { component: 'Label', children: '{{$.counts.assigned}} assigned · {{$.counts.unassigned}} waiting' },
    ]),
    cell(
      'tally',
      [
        {
          component: 'Rows',
          props: { rows: '$.tally', rowKey: 'label', empty: 'Nobody assigned yet.', columns: [{ label: 'Department', key: 'label', w: 2 }, { label: 'People', key: 'value', kind: 'mono', w: 1 }] },
        },
      ],
      { pad: 'none' },
    ),
    {
      for: '$.departments',
      as: 'department',
      key: 'department_id',
      do: {
        component: 'Cell',
        props: { mark: '$department.mark' },
        children: [
          { component: 'Sigil', props: { shape: '$department.sigil', size: 'large' } },
          { component: 'Headline', props: { level: 'name' }, children: '{{$department.name}}' },
        ],
      },
    },
  ],
};

// Clearance: every department, and what its role is granted, in plain words.
export const clearanceLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head words', 'table table'], cols: [1.4, 1], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'title' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('words', [{ component: 'Text', children: '{{$.lines.0}}' }], { ink: 'highlight', align: 'end' }),
    cell(
      'table',
      [
        {
          component: 'Rows',
          props: {
            rows: '$.departments',
            rowKey: 'department_id',
            columns: [
              { label: '', key: 'sigil', kind: 'sigil', w: 0.3 },
              { label: 'Department', key: 'name', w: 1 },
              { label: 'Its clearance', key: 'remit', w: 3.2 },
            ],
          },
        },
      ],
      { pad: 'none' },
    ),
  ],
};
