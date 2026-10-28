import type { LayoutNode } from '@niscorp/nova';

const browsed = (field: string): unknown => ({ $at: ['$.current.stack', { $prism: { $sub: [{ $ref: '$.browse' }, 1] } }, field] });

const chip: LayoutNode = {
  if: '$.asking',
  then: { component: 'Chip', props: { label: '$.asked', count: '…', ink: '$.answerInk' } },
  else: {
    if: '$.browsing',
    then: { component: 'Chip', ref: 'chip-open', props: { label: browsed('label'), count: '{{$.browse}}/{{$.current.total}}', ink: browsed('ink') } },
    else: { component: 'Chip', ref: 'chip', props: { label: '$.current.label', count: '{{$.current.position}}/{{$.current.total}}', ink: '$.current.ink' } },
  },
};

const steps: LayoutNode = {
  component: 'Row',
  props: { tone: 'controls' },
  children: {
    if: '$.browsing',
    then: [
      { component: 'Button', ref: 'deck-back', props: { label: 'Back', icon: 'back', disabled: { $eq: ['$.browse', 1] } } },
      chip,
      { component: 'Button', ref: 'deck-forward', props: { label: 'Forward', icon: 'forward', disabled: { $eq: ['$.browse', '$.current.total'] } } },
    ],
    else: [
      { component: 'Button', ref: 'back', props: { label: 'Back', icon: 'back', disabled: { $eq: ['$.current.position', 1] } } },
      chip,
      { component: 'Button', ref: 'forward', props: { label: 'Forward', icon: 'forward', disabled: { $eq: ['$.current.position', '$.current.total'] } } },
    ],
  },
};

export const dockLayout: LayoutNode = {
  component: 'Dock',
  ref: 'zone',
  model: '$.zone',
  props: { ink: { $if: '$.asking', $then: '$.lineInk', $else: '$.current.next' }, asking: '$.asking', error: { $if: '$.error', $then: true, $else: false } },
  children: [
    { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
    steps,
    {
      if: { $if: '$.asking', $then: false, $else: { $if: { $eq: ['$.current.question', '$.asked'] }, $then: '$.current.said', $else: false } },
      then: { component: 'Text', props: { tone: 'reply' }, children: '{{$.current.said}}' },
    },
    { component: 'Prompt', children: [{ component: 'Input', ref: 'text', model: '$.text', props: { placeholder: 'What would you like to see?', clearOnEnter: true, tone: 'line' } }] },
    {
      component: 'Row',
      props: { tone: 'links' },
      children: [
        {
          for: '$.screens',
          as: 'screen',
          key: 'id',
          do: { component: 'Button', ref: 'screen', props: { label: '$screen.label', value: '$screen.id', tone: 'link', current: { $eq: ['$screen.id', '$.current.screen'] } } },
        },
      ],
    },
    { component: 'Button', ref: 'send', props: { label: { $if: '$.asking', $then: 'Asking…', $else: 'Send' }, disabled: { $if: '$.text', $then: false, $else: true } } },
    {
      if: '$.browsing',
      then: { component: 'Keys', ref: 'deck-keys', props: { capture: true } },
      else: {
        component: 'Keys',
        ref: 'keys',
        props: {
          back: { $if: { $eq: ['$.current.position', 1] }, $then: false, $else: true },
          forward: { $if: { $eq: ['$.current.position', '$.current.total'] }, $then: false, $else: true },
        },
      },
    },
  ],
};
