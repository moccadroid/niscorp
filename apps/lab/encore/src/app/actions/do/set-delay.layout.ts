import type { LayoutNode } from '@niscorp/nova';

export const setDelayLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Delay a set', subtitle: '{{$.act.name}}', tone: 'accent' },
  children: [
    {
      component: 'KeyValue',
      props: {
        inline: true,
        items: [
          { label: 'on', value: '$.act.stage_name' },
          { label: 'at', value: '$.act.starts_at' },
        ],
      },
    },
    {
      component: 'Field',
      props: { label: 'Hold for (minutes)' },
      children: [{ component: 'Input', ref: 'minutes', model: '$.minutes', props: { value: '{{$.minutes}}', type: 'number' } }],
    },
    {
      component: 'Row',
      props: { gap: 10, align: 'center' },
      children: [
        { component: 'Button', ref: 'submit', props: { label: 'Call the hold', variant: 'primary' } },
        { if: '$.saved', then: { component: 'Badge', props: { label: 'called', tone: 'good' } }, else: '' },
        { if: '$.error', then: { component: 'Text', props: { value: 'That hold was refused.', tone: 'alert' } }, else: '' },
      ],
    },
  ],
};
