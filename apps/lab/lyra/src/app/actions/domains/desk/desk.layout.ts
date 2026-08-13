import type { LayoutNode } from '@niscorp/nova';

export const deskCheckInLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    { component: 'Hero', props: { title: 'Check in', lead: "Pick a class, then tap people as they arrive." } },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Section',
      props: { title: "Today's classes" },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.sessions',
            loading: '$.loadingSessions',
            rowKey: 'session_id',
            onRowRef: 'pick',
            empty: 'Nothing on today.',
            emptyHint: 'No classes means nobody to check in.',
            columns: [
              { label: 'Class', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'program_name', dotKey: 'program_tone' } },
              { label: 'Starts', px: 84, cell: { kind: 'text', key: 'time_display', color: 'soft' } },
              { label: 'Booked', px: 92, align: 'right', cell: { kind: 'badge', key: 'booked_display', toneKey: 'fill_tone' } },
            ],
          },
        },
      },
    },

    // The roster only exists once a class is chosen. An empty pane with
    // headings would look like a class with nobody in it.
    {
      if: '$.selectedSessionId',
      then: {
        component: 'Section',
        props: { title: '$.selectedName', subtitle: '$.arrivedSummary' },
        children: {
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.roster',
              loading: '$.loadingRoster',
              rowKey: 'booking_id',
              empty: 'Nobody booked into this one.',
              emptyHint: 'Walk-ins can still be checked in from the member record.',
              columns: [
                { label: 'Member', w: 2, cell: { kind: 'avatar', key: 'person_name', subKey: 'status_display' } },
                { label: 'Arrived', px: 92, cell: { kind: 'badge', key: 'arrived_label', toneKey: 'arrived_tone' } },
                { label: '', px: 108, align: 'right', cell: { kind: 'action', label: 'Check in', ref: 'checkin', variant: 'accent', hideKey: 'attended' } },
              ],
            },
          },
        },
      },
      else: '',
    },
  ],
};
