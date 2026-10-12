import type { LayoutNode } from '@niscorp/nova';

export const arrivalLayout: LayoutNode = {
  if: '$.loading',
  then: { component: 'Skeleton', props: { h: 90 } },
  else: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      {
        if: '$.done',
        then: {
          component: 'Stack',
          props: { gap: 12, align: 'center' },
          children: [
            { component: 'Icon', props: { name: 'check', size: 30, color: 'accent' } },
            { component: 'Text', props: { serif: true, size: 'xl', align: 'center' }, children: '$.doneTitle' },
            { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: '$.doneBody' },
            { if: '$.total.total_display', then: { component: 'Text', props: { serif: true, size: 'lg', align: 'center' }, children: 'Settled: {{$.total.total_display}}' }, else: '' },
          ],
        },
        else: {
          component: 'Stack',
          props: { gap: 16 },
          children: [
            { component: 'Text', props: { color: 'soft' }, children: '$.body' },
            {
              component: 'Card',
              props: { sunk: true },
              children: {
                component: 'Stack',
                props: { gap: 7 },
                children: [
                  { component: 'Row', props: { justify: 'between' }, children: [{ component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Room' }, { component: 'Text', props: { size: 'sm', weight: 600 }, children: '$.stay.room_number' }] },
                  { component: 'Row', props: { justify: 'between' }, children: [{ component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Arriving' }, { component: 'Text', props: { size: 'sm', weight: 600 }, children: '$.stay.arrival_display' }] },
                  { component: 'Row', props: { justify: 'between' }, children: [{ component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Leaving' }, { component: 'Text', props: { size: 'sm', weight: 600 }, children: '$.stay.departure_display' }] },
                ],
              },
            },
            { component: 'Button', ref: 'confirm', props: { big: true, icon: '$.icon', disabled: '$.working' }, children: '$.cta' },
          ],
        },
      },
    ],
  },
};
