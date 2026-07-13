import type { LayoutNode } from '@niscorp/nova';

export const topbarLayout: LayoutNode = {
  component: 'Box',
  props: { px: 18, h: 53, border: 'bottom' },
  children: {
    component: 'Row',
    props: { h: '100%', justify: 'between', align: 'center' },
    children: [
      {
        component: 'Row',
        props: { gap: 9, align: 'center' },
        children: [
          { component: 'Text', props: { color: 'accent' }, children: { component: 'Icon', props: { name: 'feather', size: 17 } } },
          { component: 'Text', props: { size: 'lg', weight: 620 }, children: '{{$.title}}' },
        ],
      },
      { component: 'Button', ref: 'new', props: { variant: 'primary', icon: 'plus' }, children: 'New todo' },
    ],
  },
};
