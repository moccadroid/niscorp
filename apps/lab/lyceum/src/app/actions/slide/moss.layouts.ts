import type { LayoutNode } from '@niscorp/nova';

// THE MOSS AND CHARTER SECTION'S LAYOUTS: the server that runs each person's
// screen, and the one file that decides what each person has.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });

// A claim, and beside it one thing for the room to do or to see.
export const claimLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick side', 'head side'], cols: [1.4, 1], rows: ['auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell('side', [label('{{$.side.label}}'), headline('display', '{{$.side.word}}')], { ink: '$.side.ink', align: 'center' }),
  ],
};

// Two things side by side, each a name and a line: the usual way, and this one.
export const pairLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head head', 'one two'], rows: ['auto', 1] },
  children: [
    cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]),
    cell('one', [label('{{$.one.label}}'), headline('title', '{{$.one.line}}')], { align: 'middle' }),
    cell('two', [label('{{$.two.label}}'), headline('title', '{{$.two.line}}')], { ink: 'signal', align: 'middle' }),
  ],
};

// Where permissions are checked. First the three usual places, side by side,
// one word each; a step on (the deck's `step`), the one file they are here.
export const placesLayout: LayoutNode = {
  if: { $prism: { $gte: [{ $ref: '$.step.step' }, 1] } },
  then: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['head head', 'name code'], cols: [1, 1.6], rows: ['auto', 1] },
    children: [
      cell('head', [label('{{$.title}}'), headline('display', '{{$.answer}}')]),
      cell('name', [headline('title', '{{$.kicker}}')], { ink: 'signal', align: 'center' }),
      cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink', align: 'middle' }),
    ],
  },
  else: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['head head head', 'one two three'], rows: ['auto', 1] },
    children: [
      cell('head', [headline('display', '{{$.title}}')]),
      { for: '$.places', as: 'place', key: 'area', do: { component: 'Cell', props: { area: '$place.area', align: 'center' }, children: [label('{{$place.what}}'), headline('name', '{{$place.name}}')] } },
    ],
  },
};

// The button, given to a few: the claim, and beside it who pressed — live.
export const buttonLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head pressed'], cols: [1.25, 1] },
  children: [
    cell('head', [headline('display', '{{$.title}}')], { align: 'middle' }),
    cell(
      'pressed',
      [
        {
          if: '$.presses',
          then: [label('Pressed by'), { for: '$.presses', as: 'press', key: 'press_id', do: headline('title', '{{$press.name}}') }],
          else: [headline('title', 'Got it?'), headline('display', 'Press it.')],
        },
      ],
      { ink: 'alert', align: 'middle' },
    ),
  ],
};
