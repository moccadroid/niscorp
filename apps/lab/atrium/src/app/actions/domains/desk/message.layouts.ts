import type { LayoutNode } from '@niscorp/nova';

// Four faces, one shape each, no branch at the root. The monolith had the feed
// and the open conversation side by side in a grid whose second cell was a
// condition — which is the same "two surfaces wearing one id" the issue board
// had.

// ── tile ────────────────────────────────────────────────────
export const messageTileLayout: LayoutNode = {
  component: 'Tile',
  ref: 'open',
  props: {
    title: 'Messages',
    icon: 'chat',
    blurb: { $if: '$.feed.length', $then: '{{$.feed.0.guest_name}} — {{$.feed.0.body}}', $else: 'No messages yet.' },
  },
};

// ── list ────────────────────────────────────────────────────
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

// ── detail: the conversation, WITH the box you answer in ─────
//
// This used to be two surfaces. Reading a thread was one card with a "Reply"
// button, and pressing it replaced the whole column with a second card holding
// nothing but a text box — so the words the clerk was answering were gone from
// the screen at the exact moment they needed them, and getting back to them cost
// two more clicks. A conversation and the reply to it are one thing to do.
//
// The composer is still ADDRESSABLE, which was the only real argument for the
// split: `draft` is a declared input on this action now, so the assistant hands
// over a written reply by opening the conversation with the words already in the
// box. Same reachability, one surface.
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
            // The desk is "me" here — its own replies sit on the right.
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
        // How the conversation is GOING, when the assistant has a read on it.
        // A sentence rather than a score, and marked as its own — a number
        // beside a guest's name implies a measurement nobody took, and it would
        // be wrong in public the first time it mattered.
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
        // Said only when the words in the box are not the clerk's own. Without
        // this, a prefilled composer looks like a bug the first time.
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

// On a card, like the inbox it opens from.
export const threadDetailLayout: LayoutNode = {
  component: 'Box',
  props: { maxWidth: 720 },
  children: { component: 'Card', props: {}, children: threadDetailBody },
};
