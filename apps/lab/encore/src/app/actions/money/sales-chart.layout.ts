import type { LayoutNode } from '@niscorp/nova';

export const salesChartLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.kind}} {{$.metric}}', subtitle: '{{$.range}} · by {{$.grain}}' },
  children: [
    {
      if: { $eq: ['$.grain', 'day'] },
      then: { component: 'BarChart', props: { series: '$.daily', labelKey: 'day', valueKey: '$.metric', tone: 'accent' } },
      else: {
        component: 'BarChart',
        props: {
          series: '$.hourly',
          labelKey: 'hour',
          valueKey: '$.metric',
          tone: 'accent',
          behind: { $if: '$.compare', $then: '$.previous', $else: [] },
        },
      },
    },
  ],
};
