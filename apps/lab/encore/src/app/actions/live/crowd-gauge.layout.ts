import type { LayoutNode } from '@niscorp/nova';

export const crowdGaugeLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.count.name}}', subtitle: '{{$.day}} · {{$.hour}}:00' },
  children: [{ component: 'Gauge', props: { value: '$.count.headcount', max: '$.count.capacity', label: 'people', warnAt: 0.85 } }],
};
