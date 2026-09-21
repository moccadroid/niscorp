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
// has arrived needs no badge saying it arrived. X-ray gets the whole row: the
// state word, which model, what was read and how long it took.
const status: LayoutNode = {
  if: '$.xray',
  then: {
    component: 'Row',
    props: { gap: 10, align: 'center', wrap: true },
    children: [
      { component: 'Badge', props: { label: '$.status', tone: '$.statusTone' } },
      { if: '$.by', then: { component: 'Text', props: { value: '$.by', variant: 'tag', tone: 'mute' } }, else: '' },
      { component: 'Text', props: { value: '$.say', tone: 'mute' } },
    ],
  },
  // THE APP: `plain` when the run has something an operator needs to be told —
  // it failed, or the steps are theirs to press — else what is happening, while
  // it is happening, and then nothing.
  else: { if: '$.plain', then: { component: 'Text', props: { value: '$.plain', tone: 'mute' } }, else: { if: '$.landed', then: '', else: { component: 'Text', props: { value: '$.say', tone: 'mute' } } } },
};

const progress: LayoutNode = { if: '$.progress', then: { component: 'Badge', props: { label: '$.progress', tone: 'accent' } }, else: '' };

// What was looked up, as one line. The rows stayed with the agent.
const lookups: LayoutNode = {
  if: '$.lookups',
  then: {
    component: 'Row',
    props: { gap: 8, align: 'center', wrap: true },
    children: [
      { component: 'Text', props: { value: 'looked up', variant: 'label', tone: 'mute' } },
      { component: 'Text', props: { value: '$.lookups', variant: 'mono', tone: 'mute' } },
    ],
  },
  else: '',
};

// A citation that was dropped is said, not hidden.
const notes: LayoutNode = { if: '$.notes', then: { component: 'Text', props: { value: '$.notes', variant: 'tag', tone: 'warn' } }, else: '' };

const steps: LayoutNode = {
  if: '$.steps.length',
  then: {
    component: 'Row',
    props: { gap: 8, wrap: true },
    children: [{ for: '$.steps', as: 'step', key: 'index', do: { component: 'Chip', ref: 'step', props: { label: '$.step.label', value: '$.step.index', done: '$.step.done' } } }],
  },
  else: '',
};

const followUps: LayoutNode = {
  if: '$.followUps.length',
  then: {
    component: 'Row',
    props: { gap: 8, align: 'center', wrap: true },
    children: [
      { for: '$.followUps', as: 'next', key: 'text', do: { component: 'Chip', ref: 'followUp', props: { label: '$.next.text', value: '$.next.text' } } },
    ],
  },
  else: '',
};

export const assistAnswerLayout: LayoutNode = {
  component: 'Box',
  props: { tone: 'panel', pad: 12 },
  children: [{ component: 'Stack', props: { gap: 8 }, children: [answer, status, { if: '$.xray', then: { component: 'Stack', props: { gap: 8 }, children: [lookups, notes] }, else: '' }, steps, progress, followUps] }],
};
