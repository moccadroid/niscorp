import type { LayoutNode } from '@niscorp/nova';

export const timetableLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    { component: 'Hero', props: { title: 'Timetable', lead: 'The next two weeks, generated from everything under Classes.' } },

    { component: 'Tabs', props: { value: '$.view', options: '$.views' }, ref: 'view' },

    // The legend. Programs carry a TOKEN name for their colour, so the dots
    // here and the dots in the list resolve through the same theme.
    {
      component: 'Row',
      props: { gap: 16, wrap: true, align: 'center' },
      children: {
        for: '$.programs',
        as: 'p',
        key: 'program_id',
        do: {
          component: 'Row',
          props: { gap: 7, align: 'center' },
          children: [
            { component: 'Dot', props: { tone: '$.p.tone' } },
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.p.name' },
          ],
        },
      },
    },

    {
      if: '$.calendar',
      then: {
        component: 'Calendar',
        props: { sessions: '$.sessions', days: 7, skip: '$.weekSkip', stepRef: 'stepWeek', loading: '$.loading', empty: 'Nothing scheduled in the next five weeks.' },
        ref: 'openSession',
      },
      else: {
        component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.sessions',
          loading: '$.loading',
          rowKey: 'session_id',
      onRowRef: 'openSession',
          empty: 'Nothing on the timetable.',
          emptyHint: 'Classes appear here once the weekly schedule is set.',
          columns: [
            { label: 'Class', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'program_name', dotKey: 'program_tone' } },
            { label: 'Day', px: 92, cell: { kind: 'text', key: 'day_display', color: 'soft' } },
            { label: 'Starts', px: 84, cell: { kind: 'text', key: 'time_display', color: 'soft' } },
            { label: 'Booked', px: 92, align: 'right', cell: { kind: 'badge', key: 'booked_display', toneKey: 'fill_tone' } },
          ],
        },
      },
    },
    },
  ],
};
