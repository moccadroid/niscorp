import type { LayoutNode } from '@niscorp/nova';

// A proposal — something that CHANGES something, so it waits for a press: an
// automation to read and save, or an action to open. (A query changes nothing:
// its result opens over the screen by itself, and is no proposal.)
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
  else: { component: 'Action', ref: 'proposed', props: { ink: 'alert', label: '{{$p.open.label}} →', value: '$p.open' } },
};

// One turn of the conversation: what the person wrote, what came back, and —
// once they acted on it — what came of it.
const turn: LayoutNode = {
  component: 'Cell',
  children: [
    { component: 'Label', children: 'You' },
    { component: 'Text', children: '{{$t.message}}' },
    { component: 'Label', children: 'Assistant' },
    { component: 'Text', children: '{{$t.reply}}' },
    { if: '$t.outcome', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$t.outcome}}' } },
  ],
};

// Who this assistant is for this person (built from the declarations their
// grants selected, able to do what those name); the conversation, oldest
// first; below it the last turn's proposals, the wait, what went wrong, or —
// before anything was said — what to try; and at the bottom the line to write
// in. Blue: the assistant's colour.
export const assistantLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'who', 'talk', 'out', 'field', 'go'], rows: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: '{{$.intro.title}}' }] },
    {
      component: 'Cell',
      props: { area: 'who' },
      children: [{ component: 'Text', props: { tone: 'muted' }, children: 'Built from {{$.intro.builtFrom}} · it can {{$.intro.tools}}' }],
    },
    { component: 'Cell', props: { area: 'talk', pad: 'none' }, children: [{ component: 'Sheet', children: [{ for: '$.history', as: 't', do: turn }] }] },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.thinking',
        then: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', children: 'Thinking…' }] },
        else: {
          if: '$.answered',
          then: { component: 'Cell', props: { area: 'out', pad: 'none' }, children: [{ for: '$.reply.proposals', as: 'p', do: proposal }] },
          else: {
            component: 'Cell',
            props: { area: 'out', mark: 'hatch' },
            children: [
              { if: '$.saved', then: { component: 'Label', children: 'Saved · tide runs it now — no model is asked again.' } },
              { component: 'Text', children: '{{$.intro.intro}}' },
              { for: '$.intro.starters', as: 's', do: { component: 'Action', ref: 'starter', props: { ink: 'paper', label: '{{$s}}', value: '$s' } } },
            ],
          },
        },
      },
    },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Message your assistant', enter: 'clears' } },
    { component: 'Action', ref: 'send', props: { area: 'go', ink: 'signal', label: 'Send →' } },
  ],
};
