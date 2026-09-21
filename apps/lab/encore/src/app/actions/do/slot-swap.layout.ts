import type { LayoutNode } from '@niscorp/nova';

const DAY_OPTIONS = [
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

export const slotSwapLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Move a set', subtitle: '{{$.act.name}}', tone: 'accent' },
  children: [
    {
      component: 'KeyValue',
      props: {
        inline: true,
        items: [
          { label: 'now on', value: '$.act.stage_name' },
          { label: 'day', value: '$.act.day' },
          { label: 'at', value: '$.act.starts_at' },
        ],
      },
    },
    {
      component: 'Grid',
      props: { columns: 2, gap: 10 },
      children: [
        {
          component: 'Field',
          props: { label: 'From' },
          children: [{ component: 'Select', ref: 'from', model: '$.fromStageId', props: { value: '$.fromStageId', options: '$.stages', valueKey: 'id', labelKey: 'label', placeholder: 'stage…' } }],
        },
        {
          component: 'Field',
          props: { label: 'To' },
          children: [{ component: 'Select', ref: 'to', model: '$.toStageId', props: { value: '$.toStageId', options: '$.stages', valueKey: 'id', labelKey: 'label', placeholder: 'stage…' } }],
        },
        {
          component: 'Field',
          props: { label: 'Day' },
          children: [{ component: 'Select', ref: 'day', model: '$.day', props: { value: '$.day', options: DAY_OPTIONS, valueKey: 'value', labelKey: 'label' } }],
        },
        {
          component: 'Field',
          props: { label: 'New start' },
          children: [{ component: 'Input', ref: 'time', model: '$.time', props: { value: '$.time', placeholder: 'HH:MM' } }],
        },
      ],
    },
    {
      component: 'Row',
      props: { gap: 10, align: 'center' },
      children: [
        { component: 'Button', ref: 'submit', props: { label: 'Move the set', variant: 'primary' } },
        { if: '$.saved', then: { component: 'Badge', props: { label: 'moved', tone: 'good' } }, else: '' },
        { if: '$.error', then: { component: 'Text', props: { value: 'The running order refused that move.', tone: 'alert' } }, else: '' },
      ],
    },
  ],
};
