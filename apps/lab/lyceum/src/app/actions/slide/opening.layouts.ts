import type { LayoutNode } from '@niscorp/nova';
import { assistantLayout } from '@lyceum/app/actions/assistant/assistant.layout';
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
    cell('head', [headline('display', '{{$.title}}'), headline('name', '{{$.line}}')], { align: 'middle' }),
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

// 3 · The speaker's assistant, mirrored: the claim on the left, and on the
// right the assistant as it stands on the controller — its own layout, drawn
// from a copy of its data (server/mirroring.ts).
export const mirrorLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head mirror'], cols: [1, 1.3] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('mirror', [assistantLayout], { pad: 'none' }),
  ],
};

// 4 · Where it started: what did not work, and what did.
export const originLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'not', 'did'], rows: ['auto', 1, 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('not', [headline('display', '{{$.not}}')], { align: 'middle' }),
    cell('did', [headline('display', '{{$.did}}')], { ink: 'signal', align: 'middle' }),
  ],
};

// 6 · Our answer — the whole slide.
export const answerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'line'], rows: ['auto', 1, 'auto'] },
  children: [
    { if: '$.kicker', then: cell('kick', [label('{{$.kicker}}')], { ink: 'signal' }) },
    cell('head', [headline('display', '{{$.title}}')], { ink: 'signal', align: 'center' }),
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
    cell('name', [headline('display', '{{$.title}}'), headline('title', '{{$.claim}}')], { ink: 'signal', align: 'center' }),
    cell('json', [label('1 · A layout, as JSON'), { component: 'Code', props: { text: '$.json' } }], { ink: 'ink', align: 'middle' }),
    cell('check', [label('2 · Checked against the schema'), headline('title', 'Valid')], { ink: 'highlight' }),
    cell('drawn', [
      label('3 · Drawn'),
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
    cell('head', [headline('title', '{{$.title}}')], { align: 'middle' }),
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
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('xray', [label('On your phone'), headline('display', 'X-ray')], { ink: 'signal', align: 'center' }),
  ],
};

// 11 · One screen, three renderers. Each renderer, blue while it draws a
// screen, and which screens it draws — read off the same rows the controller's
// switch writes (each row's choices are DOM, React, Vue, in that order). The
// names sit in one row and the screens in the row under them, so a name never
// moves with its list.
const renderersInUse = {
  $prism: {
    $map: {
      over: { $ref: '$.kinds' },
      as: 'kind',
      body: {
        $with: {
          let: {
            using: {
              $filter: {
                over: { $ref: '$.rows' },
                as: 'row',
                when: { $get: { from: { $var: 'row' }, path: ['choices', { $get: { from: { $var: 'kind' }, path: ['index'] } }, 'on'], fallback: { $const: false } } },
              },
            },
          },
          value: {
            area: { $get: { from: { $var: 'kind' }, path: ['area'] } },
            on: { $join: { parts: [{ $get: { from: { $var: 'kind' }, path: ['area'] } }, { $const: '-on' }] } },
            name: { $get: { from: { $var: 'kind' }, path: ['name'] } },
            ink: { $case: { branches: [{ when: { $gt: [{ $length: { $var: 'using' } }, { $const: 0 }] }, then: { $const: 'signal' } }], else: { $const: 'paper' } } },
            screens: { $pluck: { over: { $var: 'using' }, key: 'label' } },
          },
        },
      },
    },
  },
};
export const looksLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head head', 'dom react vue', 'dom-on react-on vue-on'], rows: ['auto', 1, 1] },
  children: [
    cell('head', [headline('title', '{{$.title}}')]),
    { for: renderersInUse, as: 'kind', key: 'area', do: { component: 'Cell', props: { area: '$kind.area', ink: '$kind.ink', align: 'end' }, children: [headline('title', '{{$kind.name}}')] } },
    {
      for: renderersInUse,
      as: 'kind',
      key: 'on',
      do: { component: 'Cell', props: { area: '$kind.on', ink: '$kind.ink' }, children: [{ for: '$kind.screens', as: 'screen', do: headline('name', '{{$screen}}') }] },
    },
  ],
};

// 12 · SSH into it: the command, big, to type now.
export const terminalLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', 'ssh'], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('ssh', [headline('title', '{{$.ssh}}')], { ink: 'ink', align: 'center' }),
  ],
};

// 12 · The question, and the two projects it is about.
export const questionLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'one two'], rows: [1, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('one', [label('Vercel'), headline('display', 'json-render')], { align: 'center' }),
    cell('two', [label('Google'), headline('display', 'A2UI')], { ink: 'signal', align: 'center' }),
  ],
};

// 13 · json-render ≈ Nova ∈ nisc. Two sides, each under its name: Vercel on
// the left, nisc on the right. json-render and Nova in one row, both blue;
// under json-render, Next.js and your code; beside and under Nova, nisc's
// other packages, each named by what it is.
const part = (area: string, name: string, what: string): LayoutNode => cell(area, [label(what), headline('name', name)], { ink: 'ink', align: 'middle' });
export const partsLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    size: 'fill',
    areas: ['head head head', 'vercel nisc nisc', 'jr nova moss', 'rest charter vex', 'rest prism tide', 'rest strata signal', 'rest cortex solid'],
    cols: [1.2, 1, 1],
    rows: ['auto', 'auto', 1, 1, 1, 1, 1],
  },
  children: [
    cell('head', [headline('title', '{{$.title}}')]),
    cell('vercel', [headline('name', 'Vercel')], { ink: 'highlight' }),
    cell('nisc', [headline('name', 'nisc')], { ink: 'highlight' }),
    cell('jr', [label('UI'), headline('name', 'json-render')], { ink: 'signal', align: 'middle' }),
    cell('nova', [label('UI'), headline('name', 'Nova')], { ink: 'signal', align: 'middle' }),
    cell('rest', [label('Everything else'), headline('name', 'Next.js + your code')], { align: 'middle' }),
    part('moss', 'Moss', 'App server'),
    part('charter', 'Charter', 'Authorization'),
    part('vex', 'Vex', 'Query engine'),
    part('prism', 'Prism', 'Data transforms'),
    part('tide', 'Tide', 'Automations'),
    part('strata', 'Strata', 'Migrations'),
    part('signal', 'Signal', 'LLM calls'),
    part('cortex', 'Cortex', 'Agents'),
    part('solid', 'Solid', 'Structured streaming'),
  ],
};
