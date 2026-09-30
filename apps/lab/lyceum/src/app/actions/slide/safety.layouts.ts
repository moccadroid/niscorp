import type { LayoutNode } from '@niscorp/nova';

// THE SAFETY SECTION'S LAYOUTS: what we tried to break, what broke, and what a
// closed grammar let us do about it.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });

// We tried to break it: three verdicts, side by side, the one that held in
// green and the two that did not in orange.
export const verdictsLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head head', 'leak crash explode'], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]),
    { for: '$.verdicts', as: 'verdict', key: 'area', do: { component: 'Cell', props: { area: '$verdict.area', ink: '$verdict.ink', align: 'end' }, children: [label('{{$verdict.label}}'), headline('display', '{{$verdict.verdict}}')] } },
  ],
};

// The loop: the action on the left, and on the right how it is caught now —
// by reading it, and by limits where reading cannot see.
export const loopLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'code found', 'code limits'], cols: [1.1, 1], rows: ['auto', 'auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink', align: 'end' }),
    cell('found', [headline('title', '{{$.found}}')], { ink: 'highlight' }),
    cell('limits', [label('Limits'), { for: '$.limits', as: 'limit', do: headline('name', '{{$limit.text}}') }], { ink: 'signal' }),
  ],
};

// Somebody else's screen, installed: on the left what the install check tests,
// on the right what it answered just now — the address, the status, and every
// reason it refused, as the check wrote them.
export const installLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', 'answer'], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]),
    cell(
      'answer',
      [
        { component: 'Code', props: { text: '$.vendor.url' } },
        { if: { $eq: ['$.vendor.status', 'not installed'] }, then: headline('display', 'Not installed') },
        { if: { $eq: ['$.vendor.status', 'refused'] }, then: headline('display', 'Refused') },
        { if: { $eq: ['$.vendor.status', 'pending'] }, then: headline('display', 'Passed') },
        { if: { $eq: ['$.vendor.status', 'approved'] }, then: headline('display', 'On your phones') },
        { if: '$.vendor.reasons', then: { component: 'Rows', props: { rows: '$.vendor.reasons', rowKey: 'reason', empty: '', columns: [{ label: 'Why', key: 'reason', w: 1 }] } } },
      ],
      { ink: 'signal', align: 'end' },
    ),
  ],
};
