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

// Two kinds of check: the shape, by schema; the behaviour, by reading it — and
// under the second, the example: a trigger that sends what it listens for.
export const checkedLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'schema checks'], cols: [1, 1.4], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('schema', [label('Schema'), headline('title', 'The shape')], { align: 'middle' }),
    cell('checks', [label('Checks'), headline('title', 'The behaviour'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }, label('{{$.found}}')], { ink: 'ink', align: 'middle' }),
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

// A model writing at runtime: what goes to the checks, and what comes back.
export const runtimeLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', 'flow'], rows: [1, 'auto'] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('flow', [{ component: 'Flow', props: { from: '$.from', to: '$.to', lanes: '$.lanes' } }], { ink: 'signal' }),
  ],
};

// Build time: what a review was for, and who does each half now.
export const reviewLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'quality function'], rows: [1, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('quality', [label('Quality'), headline('display', 'The checks')], { ink: 'signal', align: 'center' }),
    cell('function', [label('Function'), headline('display', 'QA')], { align: 'center' }),
  ],
};
