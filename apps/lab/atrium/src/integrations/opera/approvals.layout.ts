import type { LayoutNode } from '@niscorp/nova';

// The human-yes queue: late checkouts and upgrades guests asked for.
//
// The card that frames this surface already names it, so there is no heading
// here and no second card around each row — a card inside a card was the
// double border. What each row needs is a hierarchy that matches the
// decision: the ASK is the headline, the guest is the context under it, and
// the PRICE is stated, because approving posts exactly that number to their
// folio and a yes should never be given blind.
export const approvalsLayout: LayoutNode = {
  if: '$.loading',
  then: { component: 'Skeleton', props: { h: 72, count: 2 } },
  else: {
    if: '$.pending.length',
    then: {
      component: 'Stack',
      props: { gap: 0 },
      children: {
        for: '$.pending',
        as: 'p',
        key: 'request_id',
        do: {
          component: 'Box',
          props: { py: 14, border: 'bottom' },
          children: {
            component: 'Stack',
            props: { gap: 10 },
            children: [
              {
                component: 'Row',
                props: { justify: 'between', align: 'baseline', gap: 10 },
                children: [
                  { component: 'Text', props: { serif: true, size: 'lg' }, children: '$p.label' },
                  { component: 'Text', props: { weight: 600 }, children: '$p.amount_display' },
                ],
              },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$p.guest_name}} · Room {{$p.room_number}} · asked {{$p.asked_display}}' },
              { if: '$p.detail', then: { component: 'Text', props: { size: 'sm', color: 'soft' }, children: '$p.detail' }, else: '' },
              {
                component: 'Row',
                props: { gap: 8, align: 'center' },
                children: [
                  { component: 'Button', ref: 'approve', props: { icon: 'check', value: '$p' }, children: 'Approve · post {{$p.amount_display}}' },
                  { component: 'Button', ref: 'decline', props: { variant: 'quiet', value: '$p' }, children: 'Decline' },
                ],
              },
            ],
          },
        },
      },
    },
    else: { component: 'Empty', props: { icon: 'check', title: 'Queue is clear', hint: 'Guest asks land here the moment they are raised.' } },
  },
};
