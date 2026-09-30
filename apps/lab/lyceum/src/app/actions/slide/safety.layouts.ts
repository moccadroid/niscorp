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
    { for: '$.verdicts', as: 'verdict', key: 'area', do: { component: 'Cell', props: { area: '$verdict.area', ink: '$verdict.ink', align: 'end' }, children: [label('{{$verdict.label}}'), headline('display', '{{$verdict.verdict}}'), text('{{$verdict.what}}')] } },
  ],
};

// The loop: the action on the left, and on the right how it is caught now —
// by reading it, and by limits where reading cannot see.
export const loopLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'code found', 'code limits'], cols: [1.1, 1], rows: ['auto', 'auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink', align: 'center' }),
    cell('found', [label('Found by reading it'), headline('title', '{{$.found}}')], { ink: 'highlight' }),
    cell('limits', [label('Where reading cannot see'), { for: '$.limits', as: 'limit', do: headline('name', '{{$limit.text}}') }], { ink: 'signal' }),
  ],
};
