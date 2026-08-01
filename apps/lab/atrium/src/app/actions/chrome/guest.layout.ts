import type { LayoutNode } from '@niscorp/nova';

export const guestChromeLayout: LayoutNode = {
  component: 'Box',
  props: { bg: 'surface', border: 'bottom', px: 20, py: 13 },
  children: [
    // Applies the property's palette to the document and renders nothing.
    { component: 'Accent', props: { name: '$.accent' } },
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', gap: 12 },
      children: [
        {
          component: 'Row',
          props: { gap: 10, align: 'center' },
          children: [
            { component: 'Icon', props: { name: 'bed', size: 18, color: 'accent' } },
            { component: 'Text', props: { serif: true, size: 'lg' }, children: '$.propertyName' },
          ],
        },
        {
          component: 'Row',
          props: { gap: 10, align: 'center' },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.guestName' },
            { component: 'Button', ref: 'leave', props: { variant: 'plain' }, children: 'Leave' },
          ],
        },
      ],
    },
  ],
};
