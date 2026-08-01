import type { LayoutNode } from '@niscorp/nova';

// Cutting a credential FOR the guest in hand.
//
// It used to be a list of every stay in the house with a search box, because a
// key needed a guest and there was no way to aim a verb at a row — so the tool
// grew its own copy of the movements list to find one. Making it stay-scoped
// deleted the list, the search and the second read: the guest is context here,
// exactly as they are on every other surface in the workspace.
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
