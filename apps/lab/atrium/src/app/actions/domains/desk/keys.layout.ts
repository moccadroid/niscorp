import type { LayoutNode } from '@niscorp/nova';

export const keysLayout: LayoutNode = {
  if: '$.stayId',
  then: {
    component: 'Stack',
    props: { gap: 12 },
    children: [
      { if: '$.error', then: { component: 'Notice', props: { tone: 'warn', icon: 'alert', title: 'The door system did not answer' }, children: '$.error.message' }, else: '' },
      {
        if: '$.credential',
        then: {
          component: 'Stack',
          props: { gap: 8, align: 'center' },
          children: [
            { component: 'Icon', props: { name: 'key', size: 24, color: 'accent' } },
            { component: 'Text', props: { weight: 600 }, children: 'Cut — {{$.credential}}' },
            { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'It is on their phone now.' },
          ],
        },
        else: {
          component: 'Stack',
          props: { gap: 10 },
          children: [
            {
              component: 'Text',
              props: { size: 'sm', color: 'mute' },
              children: {
                if: '$.stay.key_issued',
                then: '{{$.stay.guest_name}} already holds a key for room {{$.stay.room_number}}. Cutting another replaces it.',
                else: 'A door credential for {{$.stay.guest_name}}, room {{$.stay.room_number}}.',
              },
            },
            {
              component: 'Button',
              ref: 'cut',
              props: { big: true, icon: 'key', disabled: '$.working' },
              children: { if: '$.stay.key_issued', then: 'Cut a replacement', else: 'Cut the key' },
            },
          ],
        },
      },
    ],
  },
  else: { component: 'Empty', props: { icon: 'key', title: 'No guest in hand', hint: 'Open a guest and this cuts their key.' } },
};
