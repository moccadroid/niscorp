import type { LayoutNode } from '@niscorp/nova';

export const actCardLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.act.name}}', subtitle: '{{$.act.genre}}' },
  children: [
    { component: 'Row', props: { gap: 8 }, children: [{ component: 'Badge', props: { label: '$.act.billing', tone: 'accent' } }] },
    {
      component: 'KeyValue',
      props: {
        items: [
          { label: 'Stage', value: '$.act.stage_name' },
          { label: 'Day', value: '$.act.day' },
          { label: 'On at', value: '$.act.starts_at' },
          { label: 'Set (min)', value: '$.act.duration_min' },
          { label: 'Expected draw', value: '$.act.draw' },
        ],
      },
    },
    {
      if: '$.delays.length',
      then: {
        component: 'List',
        props: { title: 'Holds called', rows: '$.delays', rowKey: 'delay_id', primaryKey: 'minutes', primarySuffix: ' min', secondaryKey: 'created_by', tone: 'warn' },
      },
      else: '',
    },
  ],
};
