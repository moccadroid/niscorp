import type { LayoutNode } from '@niscorp/nova';

export const staffChromeLayout: LayoutNode = {
  component: 'Box',
  props: { bg: 'surface', border: 'bottom', px: 20, py: 10 },
  children: [
    { component: 'Accent', props: { name: '$.accent' } },
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', gap: 20, wrap: true },
      children: [
        {
          component: 'Row',
          props: { gap: 9, align: 'center' },
          children: [
            { component: 'Icon', props: { name: 'bed', size: 17, color: 'accent' } },
            { component: 'Text', props: { serif: true, size: 'lg' }, children: '$.propertyName' },
            {
              if: '$.unread.count',
              then: { component: 'Badge', props: { tone: 'accent' }, children: '{{$.unread.count}} unread' },
              else: '',
            },
          ],
        },
        {
          component: 'Row',
          props: { gap: 10, align: 'center' },
          children: [
            {
              if: '$.sibling.propertyName',
              then: { component: 'Button', ref: 'switch-property', props: { variant: 'quiet', icon: 'arrow' }, children: '{{$.sibling.propertyName}}' },
              else: '',
            },
            { component: 'Avatar', props: { name: '$.staffName', size: 30 } },
            {
              component: 'Stack',
              props: { gap: 0 },
              children: [
                { component: 'Text', props: { size: 'sm', weight: 600 }, children: '$.staffName' },
                { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '$.job' },
              ],
            },
            { component: 'Button', ref: 'settings', props: { variant: 'quiet', icon: 'sliders' }, children: '' },
            { component: 'Button', ref: 'leave', props: { variant: 'plain' }, children: 'Leave' },
          ],
        },
      ],
    },
  ],
};
