import type { LayoutNode } from '@niscorp/nova';


const answer: LayoutNode = {
  if: '$.segments.length',
  then: { component: 'Spans', ref: 'answer', props: { segments: '$.segments', textKey: 'text', linkKey: 'card', active: '$.lit', markUnlinked: '$.landed' } },
  else: '',
};

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

export const assistAnswerLayout: LayoutNode = {
  component: 'Box',
  props: { tone: 'plain', py: 2 },
  children: [{ component: 'Stack', props: { gap: 8 }, children: [answer, status, steps, progress] }],
};
