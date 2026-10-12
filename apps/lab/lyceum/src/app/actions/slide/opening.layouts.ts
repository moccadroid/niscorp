import type { LayoutNode } from '@niscorp/nova';
import { sendLayout } from '@lyceum/app/actions/questions/send.layout';

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string, muted = false): LayoutNode => ({ component: 'Text', ...(muted ? { props: { tone: 'muted' } } : {}), children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });

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

export const aloneLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head'] },
  children: [cell('head', [headline('display', '{{$.title}}')], { align: 'center' })],
};

const last = (key: string): unknown => ({ $get: { from: { $ref: '$.history' }, path: [{ $sub: [{ $length: { $ref: '$.history' } }, 1] }, key], fallback: { $const: '' } } });
const drafted = (key: string): unknown => ({ $prism: { $get: { from: { $ref: '$.reply.proposals' }, path: [0, 'timer', key], fallback: { $const: '' } } } });
const typing = { $prism: { $not: { $eq: [{ $ref: '$.draft' }, { $const: '' }] } } };
const proposed = { $prism: { $and: [{ $ref: '$.answered' }, { $gt: [{ $length: { $ref: '$.reply.proposals' } }, 0] }] } };
export const mirrorLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head doc', 'asked doc', 'state doc'], cols: [1, 1.15], rows: [1, 'auto', 'auto'] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('asked', [
      label('Asked, on the controller'),
      { component: 'Code', props: { text: { $if: typing, $then: '$.draft', $else: { $prism: last('message') } } } },
    ]),
    {
      if: '$.thinking',
      then: cell('state', [headline('name', 'A model is writing…')], { mark: 'hatch' }),
      else: {
        if: proposed,
        then: cell('state', [label('To read, then save'), { component: 'Code', props: { text: drafted('when') } }], { ink: 'highlight' }),
        else: { if: { $prism: last('outcome') }, then: cell('state', [label('Saved'), { component: 'Code', props: { text: { $prism: last('outcome') } } }], { ink: 'live' }) },
      },
    },
    cell(
      'doc',
      [
        label('What came back'),
        {
          if: proposed,
          then: { component: 'Code', props: { text: drafted('json') } },
          else: { if: '$.chosen.json', then: { component: 'Code', props: { text: '$.chosen.json' } }, else: text('Nothing yet.', true) },
        },
      ],
      { ink: 'ink', align: 'middle' },
    ),
  ],
};

export const originLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'not', 'did'], rows: ['auto', 1, 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('not', [headline('display', '{{$.not}}')], { align: 'middle' }),
    cell('did', [headline('display', '{{$.did}}')], { ink: 'signal', align: 'middle' }),
  ],
};

export const answerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'line'], rows: ['auto', 1, 'auto'] },
  children: [
    { if: '$.kicker', then: cell('kick', [label('{{$.kicker}}')], { ink: 'signal' }) },
    cell('head', [headline('display', '{{$.title}}')], { ink: 'signal', align: 'center' }),
    { if: '$.line', then: cell('line', [text('{{$.line}}')], { ink: 'signal' }) },
  ],
};

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

export const xrayLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head xray'], cols: [1.25, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('xray', [label('On your phone'), headline('display', 'X-ray')], { ink: 'signal', align: 'center' }),
  ],
};

// Each row's choices are DOM, React, Vue, in that order.
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

export const terminalLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', 'ssh'], rows: ['auto', 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')]),
    cell('ssh', [headline('title', '{{$.ssh}}')], { ink: 'ink', align: 'center' }),
  ],
};

export const questionLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'one two'], rows: [1, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('one', [label('Vercel'), headline('display', 'json-render')], { align: 'center' }),
    cell('two', [label('Google'), headline('display', 'A2UI')], { ink: 'signal', align: 'center' }),
  ],
};

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
