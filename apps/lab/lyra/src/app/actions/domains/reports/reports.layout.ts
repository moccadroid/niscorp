import type { LayoutNode } from '@niscorp/nova';

export const reportsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 26 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
      children: [
        { component: 'Hero', props: { title: 'Reports', lead: 'Where the week actually goes.' } },
        {
          component: 'Row',
          props: { gap: 6, align: 'center' },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.rangeLabel' },
            { component: 'Button', props: { variant: 'ghost', label: '30d' }, ref: 'range-30' },
            { component: 'Button', props: { variant: 'ghost', label: '90d' }, ref: 'range-90' },
            { component: 'Button', props: { variant: 'ghost', label: '12m' }, ref: 'range-365' },
          ],
        },
      ],
    },

    {
      component: 'Grid',
      props: { min: 320, gap: 18 },
      children: [
        {
          component: 'Section',
          props: { title: 'Busiest hours', subtitle: 'Check-ins by time of day — where to add a class, and where to stop paying for an empty room.' },
          children: {
            component: 'Card',
            props: { flush: true },
            children: {
              component: 'Rows',
              props: {
                rows: '$.byHour',
                loading: '$.loading',
                rowKey: 'hour_key',
                empty: 'No attendance recorded yet.',
                columns: [
                  { label: 'Hour', px: 96, cell: { kind: 'text', key: 'hour_display', color: 'ink' } },
                  { label: 'Check-ins', w: 1, align: 'right', cell: { kind: 'number', key: 'total' } },
                ],
              },
            },
          },
        },

        {
          component: 'Section',
          props: { title: 'By program', subtitle: 'Six slots of one thing and one of another, to the same headcount, is a timetable problem.' },
          children: {
            component: 'Card',
            props: { flush: true },
            children: {
              component: 'Rows',
              props: {
                rows: '$.byProgram',
                loading: '$.loading',
                rowKey: 'program_name',
                empty: 'Nothing attended yet.',
                columns: [
                  { label: 'Program', w: 1, cell: { kind: 'primary', key: 'program_name', dotKey: 'tone' } },
                  { label: 'Check-ins', px: 104, align: 'right', cell: { kind: 'number', key: 'total' } },
                ],
              },
            },
          },
        },
      ],
    },

    {
      component: 'Section',
      props: { title: 'Week by week', subtitle: 'Attendance grouped on the week each class was written into.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.byWeek',
            loading: '$.loading',
            rowKey: 'week_key',
            empty: 'Not enough history yet.',
            columns: [
              // The week's first attended day, in the studio's locale —
              // `2026-W25` is the grouping key, not a label.
              { label: 'Week', px: 140, cell: { kind: 'text', key: 'week_display', color: 'ink' } },
              { label: 'Check-ins', w: 1, align: 'right', cell: { kind: 'number', key: 'total' } },
            ],
          },
        },
      },
    },

    {
      component: 'Grid',
      props: { min: 320, gap: 18 },
      children: [
        {
          component: 'Section',
          props: { title: 'The roll', subtitle: 'How the membership base splits.' },
          children: {
            component: 'Card',
            props: { flush: true },
            children: {
              component: 'Rows',
              props: {
                rows: '$.byStatus',
                loading: '$.loading',
                rowKey: 'status',
                empty: 'No members yet.',
                columns: [
                  { label: 'Status', w: 1, cell: { kind: 'badge', key: 'status_display', toneKey: 'status_tone' } },
                  { label: 'People', px: 88, align: 'right', cell: { kind: 'number', key: 'total' } },
                ],
              },
            },
          },
        },

        {
          component: 'Section',
          props: { title: 'Plan uptake', subtitle: 'What people are actually on — and why a retired plan keeps its subscribers.' },
          children: {
            component: 'Card',
            props: { flush: true },
            children: {
              component: 'Rows',
              props: {
                rows: '$.uptake',
                loading: '$.loading',
                rowKey: 'plan_name',
                empty: 'Nobody on a plan yet.',
                columns: [
                  { label: 'Plan', w: 1, cell: { kind: 'primary', key: 'plan_name', subKey: 'price_display' } },
                  { label: 'On it', px: 80, align: 'right', cell: { kind: 'number', key: 'total' } },
                ],
              },
            },
          },
        },
      ],
    },
  ],
};
