import type { LayoutStory } from '../../story-types';

export const buttonVariantsStory: LayoutStory = {
  id: 'button-variants',
  name: 'Button variants',
  description: 'A row of Buttons covering each variant plus a disabled state.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Stack',
    props: { direction: 'row', gap: 12, padding: 24, align: 'center' },
    children: [
      { component: 'Button', props: { variant: 'primary' }, children: 'Primary' },
      { component: 'Button', props: { variant: 'secondary' }, children: 'Secondary' },
      { component: 'Button', props: { variant: 'ghost' }, children: 'Ghost' },
      {
        component: 'Button',
        props: { variant: 'primary', disabled: true },
        children: 'Disabled',
      },
    ],
  },
  data: {},
  expected: { textIncludes: ['Primary', 'Secondary', 'Ghost', 'Disabled'] },
};
