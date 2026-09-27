import type { LayoutNode } from '@niscorp/nova';

// One proposal, of three kinds — an automation to read and save, an answer to
// read, an action to press. The reply says what; the proposal is the thing.
const proposal: LayoutNode = {
  if: '$p.timer',
  then: {
    component: 'Cell',
    props: { pad: 'none' },
    children: [
      {
        component: 'Sheet',
        props: { areas: ['what', 'doc', 'save'], rows: ['auto', 'auto', 'auto'] },
        children: [
          {
            component: 'Cell',
            props: { area: 'what', ink: 'highlight' },
            children: [{ component: 'Label', children: 'Read it first · fires at {{$p.timer.dueLocal}}' }, { component: 'Text', children: '{{$p.timer.intent}}' }],
          },
          { component: 'Cell', props: { area: 'doc' }, children: [{ component: 'Code', props: { text: '$p.timer.json' } }] },
          { component: 'Action', ref: 'save', props: { area: 'save', ink: 'alert', label: 'Save — tide runs it', value: '$p.timer' } },
        ],
      },
    ],
  },
  else: {
    if: '$p.answer',
    then: {
      component: 'Cell',
      props: { pad: 'none' },
      children: [
        {
          if: '$p.answer.figure',
          then: { component: 'Figure', props: { label: 'The answer', value: '$p.answer.value' } },
          else: { component: 'Rows', props: { rows: '$p.answer.rows', columns: '$p.answer.columns', empty: 'Nothing on record.' } },
        },
        { component: 'Text', props: { tone: 'muted' }, children: '{{$p.answer.said}}' },
      ],
    },
    else: { component: 'Action', ref: 'proposed', props: { ink: 'alert', label: '{{$p.open.label}} →', value: '$p.open' } },
  },
};

// Who this assistant is for this person — built from the declarations their
// grants selected, and able to do what those name — then a line to ask with,
// and one of four below: what went wrong, the wait, the reply with its
// proposals, or (before anything was asked) what to try.
export const assistantLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'who', 'field', 'go', 'out'], rows: ['auto', 'auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: '{{$.intro.title}}' }] },
    {
      component: 'Cell',
      props: { area: 'who' },
      children: [{ component: 'Text', props: { tone: 'muted' }, children: 'Built from {{$.intro.builtFrom}} · it can {{$.intro.tools}}' }],
    },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Ask your assistant' } },
    { component: 'Action', ref: 'ask', props: { area: 'go', ink: 'alert', label: 'Ask →' } },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.thinking',
        then: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', children: 'Thinking…' }] },
        else: {
          if: '$.answered',
          then: {
            component: 'Cell',
            props: { area: 'out' },
            children: [
              { component: 'Text', children: '{{$.reply.text}}' },
              { for: '$.reply.proposals', as: 'p', do: proposal },
              { if: '$.saved', then: { component: 'Label', children: 'Saved · tide runs it now — no model is asked again.' } },
            ],
          },
          else: {
            component: 'Cell',
            props: { area: 'out', mark: 'hatch' },
            children: [
              { component: 'Text', children: '{{$.intro.intro}}' },
              { for: '$.intro.starters', as: 's', do: { component: 'Action', ref: 'starter', props: { ink: 'paper', label: '{{$s}}', value: '$s' } } },
            ],
          },
        },
      },
    },
  ],
};
