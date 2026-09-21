import type { LayoutNode } from '@niscorp/nova';

// Top to bottom is how a briefing is read: what was asked, the answer — large —
// then the small print: what happened, what was looked up, what to do next.
//
// Every tone here arrives with the data (the run manager writes `statusTone`),
// so a colour is a binding, never a lookup table inside a component.


// THE ANSWER, as spans. `active` is whichever card key has the operator's
// attention, wherever in the room they pointed. Unlinked words are marked only
// once the answer has LANDED: while it streams nothing has been cited yet, and
// muting the whole of it would say "unsupported" about words still arriving.
const answer: LayoutNode = {
  if: '$.segments.length',
  then: { component: 'Spans', ref: 'answer', props: { segments: '$.segments', textKey: 'text', linkKey: 'card', active: '$.lit', markUnlinked: '$.landed' } },
  else: '',
};

// THE STATUS EXISTS ONLY WHILE SOMETHING IS HAPPENING — "Reading the running
// order…" — or when something went wrong, in one plain sentence. An answer that
// has arrived needs no badge saying it arrived. `plain` is what an operator still
// needs to be told once it has: that it failed, or that the steps are theirs to
// press. (Which model, how long, what was looked up and what was dropped are
// x-ray's, in its own panel — `say`, `lookups` and `notes` stay in the data.)
const status: LayoutNode = { if: '$.plain', then: { component: 'Text', props: { value: '$.plain', tone: 'mute' } }, else: { if: '$.landed', then: '', else: { component: 'Text', props: { value: '$.say', tone: 'mute' } } } };

const progress: LayoutNode = { if: '$.progress', then: { component: 'Badge', props: { label: '$.progress', tone: 'accent' } }, else: '' };

const steps: LayoutNode = {
  if: '$.steps.length',
  then: {
    component: 'Row',
    props: { gap: 8, wrap: true },
    children: [{ for: '$.steps', as: 'step', key: 'index', do: { component: 'Chip', ref: 'step', props: { label: '$.step.label', value: '$.step.index', done: '$.step.done' } } }],
  },
  else: '',
};

// (The follow-up questions are not here any more: they are links in the room's
// one row of next steps — frame/intent-options.layout.ts.)

export const assistAnswerLayout: LayoutNode = {
  component: 'Box',
  props: { tone: 'plain', py: 2 },
  children: [{ component: 'Stack', props: { gap: 8 }, children: [answer, status, steps, progress] }],
};
