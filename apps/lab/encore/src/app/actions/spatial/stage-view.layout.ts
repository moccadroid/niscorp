import type { LayoutNode } from '@niscorp/nova';

export const stageViewLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.stage.name}}', subtitle: '{{$.stage.kind}} · {{$.stage.zone_name}}' },
  children: [
    {
      component: 'KeyValue',
      props: {
        items: [
          { label: 'Capacity', value: '$.stage.capacity' },
          { label: 'Day', value: '$.day' },
        ],
      },
    },
    {
      component: 'List',
      props: { rows: '$.sets', rowKey: 'slot_id', primaryKey: 'act_name', secondaryKey: 'billing', metaKey: 'starts_at', empty: 'Nothing on this stage that day.' },
    },
  ],
};
