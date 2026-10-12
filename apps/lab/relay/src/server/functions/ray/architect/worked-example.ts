import type { Producer } from '@niscorp/cortex';

const EXAMPLE = {
  id: 'view.deals.byMonth',
  name: 'Deals by Month',
  title: 'Deals by Month',
  data: { deals: [], loading: true, month: 'June' },
  layout: {
    component: 'Stack',
    props: { gap: 2 },
    children: [
      {
        component: 'Row',
        props: { justify: 'space-between', align: 'center' },
        children: [
          { component: 'Text', props: { size: 'sm' }, children: '{{$.deals.length}} deals' },
          {
            component: 'Select',
            ref: 'monthSelect',
            model: '$.month',
            props: {
              label: 'Month',
              options: [
                { value: 'June', label: 'June' },
                { value: 'July', label: 'July' },
                { value: 'August', label: 'August' },
              ],
            },
          },
        ],
      },
      {
        component: 'Table',
        props: {
          rows: '$.deals',
          loading: '$.loading',
          empty: 'No deals close in this month.',
          rowKey: 'id',
          rowRef: 'dealRow',
          columns: [
            { label: 'Title', cell: { kind: 'primary', key: 'title' } },
            { label: 'Company', cell: { kind: 'text', key: 'company_name' } },
            { label: 'Value', align: 'end', cell: { kind: 'text', key: 'value_display', mono: true } },
            { label: 'Close Date', cell: { kind: 'text', key: 'close_date_display' } },
          ],
        },
      },
    ],
  },
  triggers: [
    {
      event: 'ui:model',
      ref: 'monthSelect',
      do: [
        { set: 'month', value: '@event.payload' },
        { set: 'loading', value: true },
        {
          call: 'loadDeals',
          onSuccess: [{ set: 'loading', value: false }],
          onError: [{ set: 'loading', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'dealRow',
      do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }],
    },
  ],
  endpoints: {
    loadDeals: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: '<paste the fingerprint from your query result>',
        context: {
          start: {
            $case: {
              branches: [
                { when: { $eq: [{ $ref: '$.month' }, 'June'] }, then: '2026-06-01' },
                { when: { $eq: [{ $ref: '$.month' }, 'July'] }, then: '2026-07-01' },
              ],
              else: '2026-08-01',
            },
          },
          end: {
            $case: {
              branches: [
                { when: { $eq: [{ $ref: '$.month' }, 'June'] }, then: '2026-06-30' },
                { when: { $eq: [{ $ref: '$.month' }, 'July'] }, then: '2026-07-31' },
              ],
              else: '2026-08-31',
            },
          },
        },
      },
      target: 'deals',
    },
  },
  lifecycle: {
    mount: [
      {
        call: 'loadDeals',
        onSuccess: [{ set: 'loading', value: false }],
        onError: [{ set: 'loading', value: false }],
      },
    ],
  },
};

export const workedExample = (() =>
  [
    'WORKED EXAMPLE — one complete, correct action. Model yours on this structure. The five top-level',
    'sections (data / layout / triggers / endpoints / lifecycle) are SIBLINGS — never nested inside each other:',
    JSON.stringify(EXAMPLE, null, 1),
  ].join('\n')) satisfies Producer;
