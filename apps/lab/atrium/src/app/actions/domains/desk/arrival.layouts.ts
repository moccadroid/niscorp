import type { LayoutNode } from '@niscorp/nova';

// The two surfaces about people who have not walked in yet.

// ─── one arrival, prepared ───────────────────────────────────
// Is the room ready, what have they asked for, and what does the house already
// know about them. Three questions a good clerk asks before somebody reaches the
// counter, in one card, opened at a stay.
export const arrivalLayout: LayoutNode = {
  if: '$.stayId',
  then: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      {
        component: 'Stack',
        props: { gap: 2 },
        children: [
          { component: 'Text', props: { weight: 600, size: 'lg' }, children: '{{$.stay.guest_name}}' },
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Room {{$.stay.room_number}} · {{$.stay.room_kind}} · {{$.stay.arrival_display}} to {{$.stay.departure_display}}' },
        ],
      },
      // The one thing that decides whether this is a welcome or an apology.
      {
        if: '$.room.sellable',
        then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Room {{$.stay.room_number}} is signed off and ready.' },
        else: { component: 'Notice', props: { tone: 'warn', icon: 'bed' }, children: 'Room {{$.stay.room_number}} is {{$.room.state}} — it cannot be given to them yet.' },
      },
      {
        if: '$.requests.length',
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: [
            { component: 'Rule', props: { label: 'They have asked for' } },
            {
              component: 'Rows',
              props: {
                rows: '$.requests',
                rowKey: 'request_id',
                empty: '',
                columns: [
                  { label: '', w: 1, cell: { kind: 'primary', key: 'label', subKey: 'kind' } },
                  { label: '', w: 'auto', cell: { kind: 'chip', key: 'status', toneKey: 'status_tone' } },
                ],
              },
            },
          ],
        },
        else: '',
      },
      {
        if: '$.notes.length',
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: [
            { component: 'Rule', props: { label: 'What we know' } },
            {
              component: 'Stack',
              props: { gap: 4 },
              children: { for: '$.notes', as: 'n', key: 'note_id', do: { component: 'Text', props: { size: 'sm' }, children: '$n.body' } },
            },
          ],
        },
        else: '',
      },
      {
        component: 'Button',
        ref: 'checkin',
        props: { big: true, icon: 'check', disabled: { $if: '$.room.sellable', $then: '$.working', $else: true } },
        children: { if: '$.room.sellable', then: 'Check {{$.stay.guest_name}} in', else: 'The room is not ready' },
      },
    ],
  },
  else: { component: 'Empty', props: { icon: 'check', title: 'No arrival in hand', hint: 'Open somebody due in and this prepares them.' } },
};

// ─── a block, checked in together ────────────────────────────
// Five rooms arriving at half past four is the worst hour a front desk has, and
// the thing that makes it bad is doing the same four gestures five times while
// five people watch. This does the ones that are ready, and says plainly which
// are not.
export const groupLayout: LayoutNode = {
  if: '$.groupId',
  then: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      {
        component: 'Stack',
        props: { gap: 2 },
        children: [
          { component: 'Text', props: { weight: 600, size: 'lg' }, children: '{{$.group.label}}' },
          { if: '$.group.note', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.group.note' }, else: '' },
        ],
      },
      {
        component: 'Rows',
        props: {
          rows: '$.stays',
          loading: '$.loading',
          rowKey: 'stay_id',
          empty: 'Nobody on this block.',
          columns: [
            { label: 'Guest', w: 1, cell: { kind: 'primary', key: 'guest_name', subKey: 'eta' } },
            { label: 'Room', w: 'auto', cell: { kind: 'primary', key: 'room_number' } },
            { label: '', w: 'auto', cell: { kind: 'chip', key: 'room_state', toneKey: 'room_state_tone' } },
            { label: '', w: 'auto', cell: { kind: 'action', ref: 'open', label: 'Open' } },
          ],
        },
      },
      {
        if: '$.done',
        then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Everybody with a ready room is checked in.' },
        else: '',
      },
      {
        component: 'Button',
        ref: 'checkin-ready',
        props: { big: true, icon: 'check', disabled: '$.working' },
        children: 'Check in everybody whose room is ready',
      },
      {
        component: 'Text',
        props: { size: 'sm', color: 'mute' },
        children: 'Anybody whose room is still to turn stays as they are. Nothing is checked in that has nowhere to go.',
      },
    ],
  },
  else: { component: 'Empty', props: { icon: 'door', title: 'No block in hand', hint: 'Open a group arrival and this checks them in together.' } },
};
