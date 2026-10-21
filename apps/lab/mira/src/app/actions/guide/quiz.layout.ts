import type { LayoutNode } from '@niscorp/nova';

const open = { $eq: ['$.picked', -1] };

// Once picked, the right option shows itself, and a wrong pick shows it was wrong.
const optionTone = {
  $if: open,
  $then: 'choice',
  $else: { $if: { $eq: ['$index', '$.answer'] }, $then: 'right', $else: { $if: { $eq: ['$index', '$.picked'] }, $then: 'wrong', $else: 'choice' } },
};

export const quizLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    { component: 'Text', props: { tone: 'strong' }, children: '{{$.question}}' },
    { for: '$.options', as: 'option', do: { component: 'Button', ref: 'pick', props: { label: '$option', tone: optionTone, value: '$index' } } },
    {
      if: open,
      then: '',
      else: {
        component: 'Row',
        children: [
          {
            if: { $eq: ['$.picked', '$.answer'] },
            then: { component: 'Text', props: { tone: 'right' }, children: 'Right. {{$.explanation}}' },
            else: { component: 'Text', props: { tone: 'wrong' }, children: 'Not quite. {{$.explanation}}' },
          },
          { component: 'Button', ref: 'again', props: { label: 'Try again', tone: 'step' } },
        ],
      },
    },
  ],
};
