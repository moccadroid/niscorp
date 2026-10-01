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

// Two checks a program runs, each with one thing it catches: a value the
// schema does not allow, and a trigger that sends what it listens for.
const caught = (area: string, name: string, at: string): LayoutNode =>
  cell(area, [label(name), { component: 'Code', props: { text: `$.${at}.code`, marked: `$.${at}.marked` } }, headline('name', `{{$.${at}.caught}}`)], { ink: 'ink', align: 'middle' });
export const checkedLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'schema loop'], rows: ['auto', 1] },
  children: [cell('head', [headline('display', '{{$.title}}')]), caught('schema', 'Schema validation', 'schema'), caught('loop', 'Loop detection', 'loop')],
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

// Generated at runtime: the three steps, in order.
export const runtimeLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head head', 'one two three'], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    { for: '$.steps', as: 'step', key: 'area', do: { component: 'Cell', props: { area: '$step.area', ink: '$step.ink', align: 'middle' }, children: [label('{{$step.n}}'), headline('title', '{{$step.what}}')] } },
  ],
};

// Build time: an agent writing code against an agent writing nisc — what each
// needs before it ships.
export const reviewLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'code nisc'], rows: [1, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('code', [label('An agent writes code'), headline('title', 'Read every line.')], { align: 'middle' }),
    cell('nisc', [label('An agent writes nisc'), headline('title', 'Validated. Test the result.')], { ink: 'signal', align: 'middle' }),
  ],
};
