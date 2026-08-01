import type { LayoutNode } from '@niscorp/nova';

// The guest's home. Mobile-first — one column, capped, generous. On a desk it
// stays a column, because the shape is right and a phone is where this is used.
//
// Note what is NOT in here: no test of a capability, no role, no `if key.issue`.
// The tile grid is a loop over rows that already resolved. That is the entire
// per-property difference, and it is invisible from this file.
export const conciergeLayout: LayoutNode = {
  component: 'Box',
  props: { py: 26, px: 18 },
  children: {
    component: 'Stack',
    props: { gap: 26, maxWidth: 620 },
    children: [
      // ── who and where ─────────────────────────────────────
      {
        if: '$.loading',
        then: { component: 'Skeleton', props: { h: 34, count: 2 } },
        else: {
          component: 'Hero',
          props: {
            eyebrow: '$.stay.state_text',
            title: '$.stay.guest_name',
            subtitle: '{{$.stay.room_kind}} {{$.stay.room_number}} · {{$.stay.arrival_display}} to {{$.stay.departure_display}}',
          },
        },
      },

      // A word from the desk — only while genuinely unread; opening the
      // thread marks it seen and the card folds away.
      {
        if: '$.unread.count',
        then: {
          component: 'Card',
          props: {},
          children: {
            component: 'Row',
            props: { justify: 'between', align: 'center', gap: 12 },
            children: [
              {
                component: 'Row',
                props: { gap: 10, align: 'center' },
                children: [
                  { component: 'Icon', props: { name: 'chat', size: 18, color: 'accent' } },
                  { component: 'Text', props: { weight: 600 }, children: 'A word from the desk' },
                ],
              },
              { component: 'Button', ref: 'open-messages', props: { variant: 'quiet' }, children: 'Read it' },
            ],
          },
        },
        else: '',
      },

      // ── your own activity, read back onto the home ────────
      // This is what was missing: a request, a report or a message the guest
      // made now shows up where they land, live from the DB, surviving logout.
      {
        if: '$.issues.length',
        then: {
          component: 'Section',
          props: { title: 'Your requests' },
          children: {
            component: 'Rows',
            props: {
              rows: '$.issues',
              rowKey: 'issue_id',
              dense: true,
              columns: [
                { w: 3, cell: { kind: 'primary', key: 'summary', subKey: 'detail' } },
                { w: 'auto', cell: { kind: 'chip', key: 'status', toneKey: 'status_tone' } },
              ],
            },
          },
        },
        else: '',
      },

      // The desk is always one tap away — everything else this property can do
      // lives on the HOME list below this action: live cards, composed per
      // principal from the resolved surface, grown by the assistant. The
      // hand-drawn tile grid is gone; the actions render themselves.
      {
        component: 'Card',
        children: {
          component: 'Row',
          props: { justify: 'between', align: 'center', gap: 12 },
          children: [
            {
              component: 'Row',
              props: { gap: 10, align: 'center' },
              children: [
                { component: 'Icon', props: { name: 'chat', size: 18, color: 'accent' } },
                { component: 'Text', props: { weight: 600 }, children: 'Message the desk' },
              ],
            },
            { component: 'Button', ref: 'open-messages', props: { variant: 'quiet' }, children: 'Open' },
          ],
        },
      },

      // The integrator's fingerprint, shown on purpose: a guest never cares, and
      // anyone watching the demo cares a great deal.
      {
        if: '$.loading',
        then: '',
        else: {
          component: 'Text',
          props: { size: 'xs', color: 'faint' },
          children: '{{$.stay.property_name}}, {{$.stay.city}} · reservations mirrored from {{$.stay.connector_name}}',
        },
      },
    ],
  },
};
