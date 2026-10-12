import type { LayoutNode } from '@niscorp/nova';

const proposal: LayoutNode = {
  if: '$p.timer',
  then: {
    component: 'Sheet',
    props: { areas: ['what', 'save', 'doc'], rows: ['auto', 'auto', 'auto'] },
    children: [
      {
        component: 'Cell',
        props: { area: 'what', ink: 'highlight' },
        children: [
          { component: 'Label', children: 'Read it first · {{$p.timer.when}}' },
          { component: 'Text', children: '{{$p.timer.intent}}' },
        ],
      },
      { component: 'Action', ref: 'save', props: { area: 'save', ink: 'alert', label: 'Save', value: '$p.timer' } },
      {
        component: 'Cell',
        props: { area: 'doc' },
        children: [
          { component: 'Text', props: { tone: 'muted' }, children: 'How I read it: {{$p.timer.reasoning}}' },
          { component: 'Code', props: { text: '$p.timer.json' } },
        ],
      },
    ],
  },
};

const turn: LayoutNode = {
  component: 'Cell',
  children: [
    { component: 'Label', children: 'You' },
    { component: 'Text', children: '{{$t.message}}' },
    { for: '$t.opened', as: 'o', do: { component: 'Action', ref: 'reopen', props: { ink: '$o.ink', label: '{{$o.label}} →', value: '$o' } } },
    { component: 'Label', children: 'Assistant' },
    { component: 'Text', children: '{{$t.reply}}' },
    { if: '$t.outcome', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$t.outcome}}' } },
  ],
};

const talking = { $prism: { $not: { $and: [{ $ref: '$.answered' }, { $gt: [{ $length: { $ref: '$.reply.proposals' } }, 0] }] } } };

export const assistantLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    size: 'fill',
    areas: ['kick', 'who', 'talk', 'out', 'field', 'go'],
    rows: ['auto', 'auto', 1, 'auto', 'auto', 'auto'],
  },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: '{{$.intro.title}}' }] },
    {
      component: 'Cell',
      props: { area: 'who' },
      children: [{ component: 'Text', props: { tone: 'muted' }, children: 'Can: {{$.intro.tools}}' }],
    },
    {
      if: talking,
      then: { component: 'Cell', props: { area: 'talk', pad: 'none', scroll: 'end' }, children: [{ component: 'Sheet', children: [{ for: '$.history', as: 't', do: turn }] }] },
    },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.thinking',
        then: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', children: 'Thinking…' }] },
        else: {
          if: '$.answered',
          then: { component: 'Cell', props: { area: 'out', pad: 'none', scroll: 'y' }, children: [{ for: '$.reply.proposals', as: 'p', do: proposal }] },
        },
      },
    },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Message your assistant', enter: 'clears' } },
    { component: 'Action', ref: 'send', props: { area: 'go', ink: 'signal', label: 'Send →' } },
  ],
};
