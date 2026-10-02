import type { LayoutNode } from '@niscorp/nova';

// THE CHECKS SECTION'S LAYOUTS: what a closed grammar lets a program check,
// the checks run on somebody else's JSON, what that makes safe at runtime, and
// what it changes at build time.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });

// How far the slide has been revealed (the deck's `step`).
const shown = (step: number): unknown => ({ $prism: { $gte: [{ $ref: '$.step.step' }, step] } });

// Two checks a program runs, each on one document: a value the schema does not
// allow, and a trigger that sends what it listens for. In steps: the documents;
// what each check said, in its own words; and what that makes possible.
const checkedOne = (area: string, name: string, at: string): LayoutNode =>
  cell(
    area,
    [
      label(name),
      { component: 'Code', props: { text: `$.${at}.code`, marked: `$.${at}.marked` } },
      { if: shown(1), then: [label('Refused'), { component: 'Code', props: { text: `$.said.${at}` } }] },
    ],
    { ink: 'ink', align: 'middle' },
  );
export const checkedLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head head head head head', 'schema schema schema loop loop loop', 'one one two two three three'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('head', [headline('title', '{{$.title}}')]),
    checkedOne('schema', 'Schema validation', 'schema'),
    checkedOne('loop', 'Loop detection', 'loop'),
    {
      if: shown(2),
      then: {
        for: '$.runtime',
        as: 'part',
        key: 'area',
        do: { component: 'Cell', props: { area: '$part.area', ink: '$part.ink' }, children: [label('At runtime · {{$part.n}}'), headline('name', '{{$part.what}}')] },
      },
    },
  ],
};

// Somebody else's JSON, installed: on the left what the install check tests,
// each marked by how the last install fared; on the right where the file is,
// the result in one word, and — when it was refused for a loop — the trigger
// the loop runs through, as it is in the file.
export const installLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'checks answer'], cols: [1, 1.2], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]),
    cell(
      'checks',
      [
        {
          component: 'Rows',
          props: {
            rows: '$.vendor.checks',
            rowKey: 'check',
            empty: '',
            columns: [
              { label: 'The install check', key: 'check', w: 4 },
              { label: '', key: 'passed', kind: 'sigil', w: 0.6, missing: '' },
            ],
          },
        },
      ],
      { pad: 'none', align: 'middle' },
    ),
    cell(
      'answer',
      [
        { component: 'Code', props: { text: '$.vendor.url' } },
        { if: { $eq: ['$.vendor.status', 'not installed'] }, then: headline('display', 'Not installed') },
        { if: { $eq: ['$.vendor.status', 'refused'] }, then: headline('display', 'Refused') },
        { if: { $eq: ['$.vendor.status', 'pending'] }, then: headline('display', 'Passed') },
        { if: { $eq: ['$.vendor.status', 'approved'] }, then: headline('display', 'On your phones') },
        {
          if: '$.vendor.culprit',
          then: { component: 'Code', props: { text: '$.vendor.culprit' } },
          else: { if: '$.vendor.reasons', then: { component: 'Rows', props: { rows: '$.vendor.reasons', rowKey: 'reason', empty: '', columns: [{ label: 'Why', key: 'reason', w: 1 }] } } },
        },
      ],
      { ink: 'signal', align: 'middle' },
    ),
  ],
};

// Build time: an agent writing code against an agent writing nisc — what each
// needs before it ships.
export const reviewLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'code nisc'], rows: [1, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('code', [label('An agent writes code'), headline('name', 'Too much to read.'), headline('name', 'Slop ships.')], { align: 'middle' }),
    cell('nisc', [label('An agent writes nisc'), headline('name', '1 · Validation'), headline('name', '2 · Mechanical checks'), headline('name', '3 · Test the result')], { ink: 'signal', align: 'middle' }),
  ],
};
