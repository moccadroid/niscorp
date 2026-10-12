import type { LayoutNode } from '@niscorp/nova';

export const messageTileLayout: LayoutNode = {
  component: 'Tile',
  ref: 'open',
  props: {
    title: 'Messages',
    icon: 'chat',
    blurb: { $if: '$.feed.length', $then: '{{$.feed.0.guest_name}} — {{$.feed.0.body}}', $else: 'No messages yet.' },
  },
};

export const messageListLayout: LayoutNode = {
  component: 'Rows',
  props: {
    rows: '$.feed',
    loading: '$.loading',
    rowKey: 'message_id',
    rowRef: 'open-thread',
    empty: 'No messages yet.',
    columns: [
      { label: 'Guest', w: 1, cell: { kind: 'primary', key: 'guest_name', subKey: 'room_number' } },
      { label: 'Message', w: 2, cell: { kind: 'text', key: 'body' } },
      { label: 'From', w: 'auto', cell: { kind: 'chip', key: 'sender', toneKey: 'sender_tone' } },
      { label: 'When', w: 'auto', cell: { kind: 'text', key: 'sent_display' } },
    ],
  },
};

const threadDetailBody: LayoutNode = {
  component: 'Stack',
  props: { gap: 14 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center' },
      children: [
        { component: 'Text', props: { serif: true, size: 'lg' }, children: '$.guestName' },
        { component: 'Button', ref: 'close', props: { variant: 'plain', icon: 'close', label: 'Close this conversation' }, children: 'Close' },
      ],
    },
    { component: 'Rule', props: {} },
    {
      component: 'Box',
      props: { scroll: true, stickBottom: true, h: 320 },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: {
          for: '$.thread',
          as: 'm',
          key: 'message_id',
          do: {
            component: 'Bubble',
            props: { mine: { $if: { $eq: ['$m.sender', 'desk'] }, $then: true, $else: false }, stamp: '$m.sent_display' },
            children: '$m.body',
          },
        },
      },
    },
    { component: 'Rule', props: {} },
    {
      component: 'Stack',
      props: { gap: 8 },
      children: [
        {
          if: '$.reading',
          then: {
            component: 'Row',
            props: { gap: 6, align: 'center' },
            children: [
              { component: 'Icon', props: { name: 'sparkle', size: 14, color: 'accent' } },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.reading' },
            ],
          },
          else: '',
        },
        {
          if: '$.drafted',
          then: {
            component: 'Row',
            props: { gap: 6, align: 'center' },
            children: [
              { component: 'Icon', props: { name: 'sparkle', size: 14, color: 'accent' } },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted for you — edit it or write your own.' },
            ],
          },
          else: '',
        },
        { component: 'Textarea', ref: 'draft', model: '$.draft', props: { placeholder: 'Reply to the guest…', rows: 4 } },
        {
          component: 'Row',
          props: { justify: 'end' },
          children: [{ component: 'Button', ref: 'send', props: { icon: 'send', disabled: '$.working' }, children: 'Send' }],
        },
      ],
    },
  ],
};

export const threadDetailLayout: LayoutNode = {
  component: 'Box',
  props: { maxWidth: 720 },
  children: { component: 'Card', props: {}, children: threadDetailBody },
};
