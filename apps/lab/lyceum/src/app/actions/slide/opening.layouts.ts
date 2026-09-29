import type { LayoutNode } from '@niscorp/nova';
import { sendLayout } from '@lyceum/app/actions/questions/send.layout';

// THE OPENING'S LAYOUTS. A slide is an anchor: the name of the thing, one
// claim, one picture. What is argued is said — it is in the notes, not here.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string, muted = false): LayoutNode => ({ component: 'Text', ...(muted ? { props: { tone: 'muted' } } : {}), children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });

// 1 · The name, one line, and how to join: the code, the address, the SSH
// command where the deployment has one.
export const openingTitleLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head join'], cols: [1.4, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}'), headline('name', '{{$.line}}')], { align: 'end' }),
    cell('join', [
      label('Join'),
      { component: 'Qr', props: { value: '$.address.url' } },
      headline('name', '{{$.address.host}}'),
      { if: '$.address.ssh', then: { component: 'Code', props: { text: '$.address.ssh' } } },
    ]),
  ],
};

// One headline, alone on the slide.
export const aloneLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head'] },
  children: [cell('head', [headline('display', '{{$.title}}')], { align: 'center' })],
};

// 4 · Where it started: what did not work, and what did.
export const originLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'not', 'did'], rows: ['auto', 1, 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('not', [headline('display', '{{$.not}}')], { align: 'end' }),
    cell('did', [headline('display', '{{$.did}}')], { ink: 'signal', align: 'end' }),
  ],
};

// 5 · The problem, and the usual answer under it, small.
export const problemLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', 'usual'], rows: [1, 'auto'] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('usual', [label('{{$.usual.label}}'), text('{{$.usual.text}}', true)]),
  ],
};

// 6 · Our answer — the whole slide.
export const answerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'line'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')], { ink: 'signal' }),
    cell('head', [headline('display', '{{$.title}}')], { ink: 'signal', align: 'end' }),
    cell('line', [text('{{$.line}}')], { ink: 'signal' }),
  ],
};

// 7 · Nova: the name, the claim, and how it works in three steps.
export const novaLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['name name name', 'claim claim claim', 'one two three'], rows: [1, 'auto', 'auto'] },
  children: [
    cell('name', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('claim', [headline('title', '{{$.claim}}')], { ink: 'signal' }),
    { for: '$.steps', as: 'step', key: 'area', do: { component: 'Cell', props: { area: '$step.area' }, children: [label('{{$step.n}}'), headline('name', '{{$step.title}}'), text('{{$step.text}}')] } },
  ],
};

// 8 · An action: its source, whole, and beside it its layout, rendered from
// the same JSON a phone renders.
export const actionLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['code head', 'code form'], cols: [2.2, 0.9], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('title', '{{$.title}}')]),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink' }),
    cell('form', [label('Its layout, rendered'), sendLayout]),
  ],
};

// A point: the claim, and the one line that says why it matters.
export const pointLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'line'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('line', [headline('name', '{{$.line}}')], { ink: 'signal' }),
  ],
};

// A point with the code it is about beside it.
export const pointCodeLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'code line'], cols: [1.15, 1], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('line', [headline('name', '{{$.line}}')], { ink: 'signal' }),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink' }),
  ],
};

// 11 · One set of data, three ways to draw it.
export const looksLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'styled plain term'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('styled', [headline('name', 'With a stylesheet')], { ink: 'signal' }),
    cell('plain', [headline('name', 'Without one')]),
    cell('term', [headline('name', 'In a terminal'), { if: '$.address.ssh', then: { component: 'Code', props: { text: '$.address.ssh' } } }], { ink: 'ink' }),
  ],
};
