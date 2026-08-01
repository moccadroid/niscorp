import type { LayoutNode } from '@niscorp/nova';

export const keyLayout: LayoutNode = {
  if: '$.loading',
  then: { component: 'Skeleton', props: { h: 120 } },
  else: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      {
        if: '$.stay.key_issued',
        then: {
          component: 'Stack',
          props: { gap: 14 },
          children: [
            {
              component: 'Card',
              props: {},
              children: {
                component: 'Stack',
                props: { gap: 12, align: 'center' },
                children: [
                  { component: 'Icon', props: { name: 'key', size: 34, color: 'accent' } },
                  { component: 'Text', props: { serif: true, size: 'xl' }, children: 'Room {{$.stay.room_number}}' },
                  { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'Hold your phone to the reader. The credential is live until you check out.' },
                  { component: 'Badge', props: { tone: 'good', dot: true }, children: 'Key active' },
                ],
              },
            },
            { if: '$.credential', then: { component: 'Text', props: { size: 'xs', color: 'faint', align: 'center' }, children: 'Credential {{$.credential}}' }, else: '' },
          ],
        },
        else: {
          component: 'Stack',
          props: { gap: 16 },
          children: [
            { component: 'Text', props: { color: 'soft' }, children: 'Your door opens from this phone. Nothing to collect at the desk.' },
            { component: 'Button', ref: 'cut', props: { big: true, icon: 'key', disabled: '$.working' }, children: { if: '$.working', then: 'Cutting your key…', else: 'Send the key to this phone' } },
          ],
        },
      },
      {
        if: '$.error',
        then: { component: 'Notice', props: { tone: 'warn', icon: 'alert', title: 'The door system did not answer' }, children: '$.error.message' },
        else: '',
      },
    ],
  },
};
