import type { LayoutNode } from '@niscorp/nova';

// The slides' layouts: the one grammar at two registers — one loud thing per
// slide (a display headline or a figure), everything else at reading size.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });

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

// NOT BUILT YET: what should happen on this slide and does not yet, in a
// hatched cell — so a walk through the deck shows every missing beat. A slide
// whose `pending` is empty draws nothing here, and its row collapses.
const todo: LayoutNode = {
  if: '$.pending',
  then: cell('todo', [label('Not built yet'), { component: 'Text', children: '{{$.pending}}' }], { mark: 'hatch' }),
};

// The slide's sentences, one Text each, in the cell they are given.
const sentences: LayoutNode = { for: '$.lines', as: 'line', do: { component: 'Text', children: '{{$line.text}}' } };

// Words beside code: the claim and its sentences on the left, the artifact it
// is about on the right with the lines that matter marked, a tag under both.
export const codeLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick code', 'head code', 'body code', 'tags tags', 'todo todo'], cols: [1, 1.25], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'title' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('body', [sentences]),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink' }),
    { if: '$.tag', then: cell('tags', [label('{{$.tag}}')], { ink: 'highlight' }) },
    todo,
  ],
};

// A claim and its points: numbered or labelled rows under the headline, then
// what they add up to.
export const pointsLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'points', 'words', 'todo'], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell(
      'points',
      [{ component: 'Rows', props: { rows: '$.points', rowKey: 'label', columns: [{ label: '', key: 'label', kind: 'mono', w: 1 }, { label: '', key: 'text', w: 4 }] } }],
      { pad: 'none' },
    ),
    { if: '$.lines.0', then: cell('words', [sentences], { ink: 'highlight' }) },
    todo,
  ],
};

// Three numbers, each one measured, and what they say.
export const figuresLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'one two three', 'words words words', 'todo todo todo'], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('one', [{ component: 'Figure', props: { label: '$.figures.0.label', value: '$.figures.0.value' } }], { ink: 'live' }),
    cell('two', [{ component: 'Figure', props: { label: '$.figures.1.label', value: '$.figures.1.value' } }], { ink: 'signal' }),
    cell('three', [{ component: 'Figure', props: { label: '$.figures.2.label', value: '$.figures.2.value' } }]),
    cell('words', [sentences]),
    todo,
  ],
};

// The app's own size, counted from its source by the server — so it cannot go
// stale (server/census.ts).
export const censusLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick chart', 'head chart', 'share chart'], cols: [1.2, 1], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell(
      'chart',
      [
        label('This app, in lines of code'),
        {
          component: 'Columns',
          props: {
            bars: [
              { label: 'Data', value: '$.census.data', ink: 'live' },
              { label: 'Code', value: '$.census.code', ink: 'signal' },
              { label: 'Tests', value: '$.census.checkLines', ink: 'ink' },
            ],
          },
        },
        { component: 'Text', props: { tone: 'muted' }, children: 'Data: app/, every file checked against its schema. Code: the renderers, the server, the database. Comments and blank lines not counted.' },
      ],
    ),
    cell('share', [{ component: 'Figure', props: { label: 'percent of this app is data', value: '$.census.share' } }], { ink: 'live' }),
  ],
};

// A demo: the claim and why on the left; on the right, what happens in the
// room, step by step.
export const beatLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick demo', 'head demo', 'body demo', 'todo todo'], cols: [1, 1.2], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'title' }, children: '{{$.title}}' }], { align: 'end' }),
    cell('body', [sentences]),
    cell(
      'demo',
      [label('In the room'), { component: 'Rows', props: { rows: '$.steps', rowKey: 'n', columns: [{ label: '', key: 'n', kind: 'mono', w: 0.4 }, { label: '', key: 'text', w: 5 }] } }],
      { ink: 'ink' },
    ),
    todo,
  ],
};

// The map: every row a thing nisc does, in three columns.
export const mapLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'table', 'todo'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'title' }, children: '{{$.title}}' }], { align: 'end' }),
    cell(
      'table',
      [
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'easy',
            columns: [
              { label: 'Easy', key: 'easy', w: 1 },
              { label: 'Only here', key: 'only', w: 1 },
              { label: 'Sounds fishy — lyceum does it', key: 'proven', w: 1 },
            ],
          },
        },
      ],
      { pad: 'none' },
    ),
    todo,
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
