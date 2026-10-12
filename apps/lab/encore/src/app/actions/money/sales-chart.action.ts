import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { salesChartLayout } from './sales-chart.layout';
import { salesHourlyPrism, salesDailyPrism, salesPreviousPrism } from './money.prism';
import { dayField } from '@encore/app/actions/shared/input-fields';

export const salesChartAction: ActionDefinition = {
  id: 'sales.chart',
  title: 'Sales',
  description: 'A chart of ticket or bar sales — units or revenue, by hour or by day, for one day or the whole weekend, optionally against the day before; open it when money, takings, revenue, tickets sold or the bars are mentioned.',
  data: { metric: 'revenue', grain: 'hour', range: 'today', compare: false, kind: 'bar', day: 'sat', hourly: [], daily: [], previous: [], loading: true },
  layout: salesChartLayout,
  endpoints: {
    loadHourly: { url: '/api/readings/vex', method: 'POST', request: salesHourlyPrism, target: 'hourly' },
    loadDaily: { url: '/api/readings/vex', method: 'POST', request: salesDailyPrism, target: 'daily' },
    loadPrevious: { url: '/api/readings/vex', method: 'POST', request: salesPreviousPrism, target: 'previous' },
  },
  lifecycle: {
    mount: [
      { call: 'loadHourly', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadDaily' },
      { call: 'loadPrevious' },
    ],
  },
};

export const salesChartInputSchema = z.toJSONSchema(
  z.object({
    metric: z.enum(['revenue', 'units']).optional().describe('What the bars measure: revenue is money taken, units is how many were sold.'),
    grain: z.enum(['hour', 'day']).optional().describe('The width of one bar: an hour of trading, or a whole festival day.'),
    range: z.enum(['today', 'weekend']).optional().describe('How much to chart: today alone, or the whole weekend so far.'),
    compare: z.boolean().optional().describe('Compare against the day before, drawn behind the bars.'),
    kind: z.enum(['tickets', 'bar']).optional().describe('Which takings: tickets sold at the gates, or drinks sold at the bar.'),
    day: dayField.optional(),
  }),
);
