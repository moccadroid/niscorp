import type { LayoutNode } from '@niscorp/nova';

export const attendanceNowLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'On site', subtitle: '{{$.day}} · {{$.hour}}:00' },
  children: [
    { component: 'Gauge', props: { value: '$.total.headcount', max: '$.total.capacity', label: 'people on site', warnAt: 0.85 } },
    { component: 'List', props: { title: 'By zone', rows: '$.zones', rowKey: 'zone_id', primaryKey: 'name', secondaryKey: 'fill_display', metaKey: 'headcount', empty: 'No counts for that hour.' } },
  ],
};
