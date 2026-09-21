import type { LayoutNode } from '@niscorp/nova';

export const weatherRadarLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Weather', subtitle: '{{$.day}} · {{$.hour}}:00', tone: { $if: '$.at.severity', $then: 'warn', $else: 'plain' } },
  children: [
    {
      component: 'Row',
      props: { gap: 10, align: 'center' },
      children: [
        { component: 'Badge', props: { label: '$.at.condition', tone: { $if: '$.at.severity', $then: 'warn', $else: 'mute' } } },
        {
          component: 'KeyValue',
          props: {
            inline: true,
            items: [
              { label: 'rain mm', value: '$.at.rain_mm' },
              { label: 'wind kph', value: '$.at.wind_kph' },
            ],
          },
        },
      ],
    },
    // The day in rain: the bar AT the aimed hour is marked, so "is it building
    // or clearing" is read off the neighbours without a second card.
    { component: 'BarChart', props: { series: '$.hours', labelKey: 'hour', valueKey: 'rain_mm', highlight: '$.hour', tone: 'warn', unit: 'mm' } },
  ],
};
