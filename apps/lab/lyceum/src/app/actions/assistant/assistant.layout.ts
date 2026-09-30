import type { LayoutNode } from '@niscorp/nova';

// A proposal — something that would CHANGE something by itself, so it waits
// for a press: an automation to read and save. (What was opened — an action, a
// vex query — changes nothing, opened over the screen by itself, and is kept in
// the conversation.)
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
            children: [
              { component: 'Label', children: 'Read it first · {{$p.timer.when}}' },
              { component: 'Text', children: '{{$p.timer.intent}}' },
              // How the writer read the request — so it can be corrected.
              { component: 'Text', children: 'How I read it: {{$p.timer.reasoning}}' },
            ],
          },
          { component: 'Cell', props: { area: 'doc' }, children: [{ component: 'Code', props: { text: '$p.timer.json' } }] },
          { component: 'Action', ref: 'save', props: { area: 'save', ink: 'alert', label: 'Save', value: '$p.timer' } },
        ],
      },
    ],
  },
};

// One turn of the conversation: what the person wrote; everything the
// assistant opened for it — a vex query (green), an action — pressed, it opens
// again (a query replayed now); what came back; and, once they acted on a
// proposal, what came of it.
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

// Who this assistant is for this person (built from the declarations their
// grants selected, able to do what those name); the conversation, oldest
// first; below it the last turn's proposals, the wait, or what went wrong; and
// at the bottom the line to write in — the conversation takes the room between.
// Blue: the assistant's colour.
export const assistantLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'who', 'talk', 'out', 'field', 'go'], rows: ['auto', 'auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: '{{$.intro.title}}' }] },
    {
      component: 'Cell',
      props: { area: 'who' },
      children: [{ component: 'Text', props: { tone: 'muted' }, children: 'Can: {{$.intro.tools}}' }],
    },
    // The conversation takes the room there is, scrolls, and opens on its newest turn.
    { component: 'Cell', props: { area: 'talk', pad: 'none', scroll: 'end' }, children: [{ component: 'Sheet', children: [{ for: '$.history', as: 't', do: turn }] }] },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.thinking',
        then: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', children: 'Thinking…' }] },
        else: {
          if: '$.answered',
          then: { component: 'Cell', props: { area: 'out', pad: 'none' }, children: [{ for: '$.reply.proposals', as: 'p', do: proposal }] },
        },
      },
    },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Message your assistant', enter: 'clears' } },
    { component: 'Action', ref: 'send', props: { area: 'go', ink: 'signal', label: 'Send →' } },
  ],
};
