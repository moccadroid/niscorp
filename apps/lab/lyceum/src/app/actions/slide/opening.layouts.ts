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
    { if: '$.kicker', then: cell('kick', [label('{{$.kicker}}')], { ink: 'signal' }) },
    cell('head', [headline('display', '{{$.title}}')], { ink: 'signal', align: 'end' }),
    { if: '$.line', then: cell('line', [text('{{$.line}}')], { ink: 'signal' }) },
  ],
};

// 7 · Nova: the name, the claim, and how it works in three steps.
// One real node of the Q&A form goes through all three: its JSON, checked,
// and drawn — the drawn one is that same node, rendered here (no ref: on the
// projector it is not pressable).
export const novaLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['name json', 'name check', 'name drawn'], cols: [1, 1.1], rows: ['auto', 'auto', 1] },
  children: [
    cell('name', [headline('display', '{{$.title}}'), headline('title', '{{$.claim}}')], { ink: 'signal', align: 'end' }),
    cell('json', [label('1 · A model writes it'), { component: 'Code', props: { text: '$.json' } }], { ink: 'ink', align: 'end' }),
    cell('check', [label('2 · A schema checks it'), headline('title', 'Valid')], { ink: 'highlight' }),
    cell('drawn', [
      label('3 · Nova runs it, a renderer draws it'),
      { component: 'Sheet', props: { size: 'fill', areas: ['button'] }, children: [cell('button', [{ component: 'Action', props: { ink: 'alert', label: 'Send →' } }], { align: 'center' })] },
    ]),
  ],
};

// 8 · An action: the name bottom-left, its source in the middle, its layout
// rendered on the right from the same JSON a phone renders.
export const actionLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick code form', 'head code form'], cols: [0.85, 1.5, 0.9], rows: ['auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')], { align: 'end' }),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink' }),
    cell('form', [label('Drawn'), sendLayout], { ink: 'signal' }),
  ],
};

// 9 · Your screen is data: the claim, and beside it the button they are about
// to get.
export const xrayLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head xray'], cols: [1.25, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('xray', [label('On your phone'), headline('display', 'X-ray')], { ink: 'signal', align: 'center' }),
  ],
};

// 10 · Three of you got a button: the claim, and beside it the button three
// phones just got.
export const threeLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head press'], cols: [1.25, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('press', [label('On three phones'), headline('display', 'Press')], { ink: 'alert', align: 'center' }),
  ],
};

// 11 · One set of trees, four things that draw them — the four take the slide.
export const looksLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head head head', 'dom react vue term'], rows: ['auto', 1] },
  children: [
    cell('head', [headline('title', '{{$.title}}')]),
    cell('dom', [headline('title', 'DOM')], { ink: 'signal', align: 'end' }),
    cell('react', [headline('title', 'React')], { align: 'end' }),
    cell('vue', [headline('title', 'Vue')], { align: 'end' }),
    cell('term', [headline('title', 'Terminal'), { if: '$.address.ssh', then: { component: 'Code', props: { text: '$.address.ssh' } } }], { ink: 'ink', align: 'end' }),
  ],
};

// 12 · The question, and the two projects it is about.
export const questionLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'one two'], rows: [1, 'auto'] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('one', [label('Vercel'), headline('title', 'json-render')]),
    cell('two', [label('Google'), headline('title', 'A2UI')]),
  ],
};

// 13, 14 · One difference, side by side: theirs on paper, ours in ink.
export const differenceLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'theirs ours'], cols: [1, 1.3], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]),
    cell('theirs', [label('json-render'), headline('title', '{{$.theirs}}')], { align: 'end' }),
    cell('ours', [label('Nova'), headline('title', '{{$.ours}}'), { if: '$.code', then: { component: 'Code', props: { text: '$.code', marked: '$.marked' } } }], { ink: '$.oursInk', align: 'end' }),
  ],
};
