import type { Example } from '@relay/screen-builder';

const FINGERPRINT = '<the fingerprint prove answered>';

const settled = { onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] };

const pickedMonth: Example = {
  intent: 'Deals closing in a month picked from June, July and August; picking one reloads the table; clicking a row opens the deal.',
  prove: [
    {
      intent: 'deals whose close date is on or after start and on or before end, with title, company name, stage, the value, in whole dollars, as money ("$185K", "$1.2M") and the close date as a short date ("Jun 7"), ordered by close date',
      shape: [{ id: '', title: '', company: '', stage: '', value_display: '', close_date_display: '' }],
      context: { start: '2026-06-01', end: '2026-06-30' },
    },
  ],
  action: {
    id: 'deals.by-month',
    name: 'Deals by month',
    data: { deals: [], loading: true, month: 'June' },
    layout: {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        {
          component: 'Row',
          props: { justify: 'space-between', align: 'center' },
          children: [
            { component: 'Text', props: { size: 'sm' }, children: '{{$.deals.length}} deals' },
            { component: 'Select', ref: 'month', model: '$.month', props: { label: 'Month', options: [{ value: 'June', label: 'June' }, { value: 'July', label: 'July' }, { value: 'August', label: 'August' }] } },
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
              { label: 'Company', hideNarrow: true, cell: { kind: 'text', key: 'company' } },
              { label: 'Stage', hideNarrow: true, cell: { kind: 'badge', key: 'stage' } },
              { label: 'Value', align: 'end', cell: { kind: 'text', key: 'value_display', mono: true } },
              { label: 'Close date', cell: { kind: 'text', key: 'close_date_display' } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:model', ref: 'month', do: [{ set: 'loading', value: true }, { call: 'loadDeals', ...settled }] },
      { message: 'deals-changed', do: [{ call: 'loadDeals', ...settled }] },
      { event: 'ui:click', ref: 'dealRow', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
    ],
    endpoints: {
      loadDeals: {
        url: '/api/vex',
        method: 'POST',
        request: {
          fingerprint: FINGERPRINT,
          context: {
            start: { $case: { branches: [{ when: { $eq: [{ $ref: '$.month' }, 'June'] }, then: '2026-06-01' }, { when: { $eq: [{ $ref: '$.month' }, 'July'] }, then: '2026-07-01' }], else: '2026-08-01' } },
            end: { $case: { branches: [{ when: { $eq: [{ $ref: '$.month' }, 'June'] }, then: '2026-06-30' }, { when: { $eq: [{ $ref: '$.month' }, 'July'] }, then: '2026-07-31' }], else: '2026-08-31' } },
          },
        },
        target: 'deals',
      },
    },
    lifecycle: { mount: [{ call: 'loadDeals', ...settled }] },
  },
  probes: [
    { do: [{ set: 'month', to: 'July' }], changes: 'deals' },
    { do: [{ click: 'dealRow' }], opens: 'crm.deal.view' },
  ],
};

const searchBox: Example = {
  intent: 'All companies with name, industry and size; typing in a search box narrows them by name; clicking a row opens the company.',
  prove: [
    {
      intent: 'companies whose name matches the pattern q, with name, industry and size, ordered by name',
      shape: [{ id: '', name: '', industry: '', size: '' }],
      context: { q: '%an%' },
    },
  ],
  action: {
    id: 'companies.search',
    name: 'Find a company',
    data: { companies: [], search: '' },
    layout: {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        { component: 'Input', ref: 'search', model: '$.search', props: { placeholder: 'Search companies', icon: 'search', debounce: 200 } },
        {
          component: 'Table',
          props: {
            rows: '$.companies',
            empty: 'No company matches.',
            rowKey: 'id',
            rowRef: 'companyRow',
            columns: [
              { label: 'Name', cell: { kind: 'primary', key: 'name' } },
              { label: 'Industry', cell: { kind: 'text', key: 'industry' } },
              { label: 'Size', cell: { kind: 'text', key: 'size' } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:model', ref: 'search', do: [{ call: 'load' }] },
      { message: 'companies-changed', do: [{ call: 'load' }] },
      { event: 'ui:click', ref: 'companyRow', do: [{ push: { action: 'crm.company.view', input: { id: '@event.payload' } } }] },
    ],
    endpoints: {
      load: {
        url: '/api/vex',
        method: 'POST',
        request: { fingerprint: FINGERPRINT, context: { q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } } },
        target: 'companies',
      },
    },
    lifecycle: { mount: [{ call: 'load' }] },
  },
  probes: [
    { do: [{ set: 'search', to: 'an' }], changes: 'companies' },
    { do: [{ click: 'companyRow' }], opens: 'crm.company.view' },
  ],
};

const dateRange: Example = {
  intent: 'Deals closing between two dates the person picks; changing either date reloads the table.',
  prove: [
    {
      intent: 'deals whose close date is on or after start and on or before end, with title, the value, in whole dollars, as money ("$185K", "$1.2M") and the close date as a short date ("Jun 7"), ordered by close date',
      shape: [{ id: '', title: '', value_display: '', close_date_display: '' }],
      context: { start: '2026-06-01', end: '2026-08-31' },
    },
  ],
  action: {
    id: 'deals.between',
    name: 'Deals closing between',
    data: { deals: [], start: '2026-06-01', end: '2026-08-31' },
    layout: {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        {
          component: 'Row',
          props: { gap: 3 },
          children: [
            { component: 'Input', ref: 'start', model: '$.start', props: { type: 'date', label: 'From' } },
            { component: 'Input', ref: 'end', model: '$.end', props: { type: 'date', label: 'To' } },
          ],
        },
        {
          component: 'Table',
          props: {
            rows: '$.deals',
            empty: 'No deals close between these dates.',
            rowKey: 'id',
            columns: [
              { label: 'Title', cell: { kind: 'primary', key: 'title' } },
              { label: 'Value', align: 'end', cell: { kind: 'text', key: 'value_display', mono: true } },
              { label: 'Close date', cell: { kind: 'text', key: 'close_date_display' } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:model', ref: 'start', do: [{ call: 'load' }] },
      { event: 'ui:model', ref: 'end', do: [{ call: 'load' }] },
      { message: 'deals-changed', do: [{ call: 'load' }] },
    ],
    endpoints: {
      load: {
        url: '/api/vex',
        method: 'POST',
        request: { fingerprint: FINGERPRINT, context: { start: { $ref: '$.start' }, end: { $ref: '$.end' } } },
        target: 'deals',
      },
    },
    lifecycle: { mount: [{ call: 'load' }] },
  },
  probes: [
    { do: [{ set: 'start', to: '2026-07-15' }], changes: 'deals' },
    { do: [{ set: 'end', to: '2026-07-01' }], changes: 'deals' },
  ],
};

const headlineAndList: Example = {
  intent: 'The total value of open deals as a headline number, the five biggest open deals below it, and a button that opens the form for a new deal.',
  prove: [
    { intent: 'the total value of all open deals, in whole dollars, as money ("$8.9M")', shape: { total_display: '' } },
    { intent: 'the five open deals with the highest value, with title and the value, in whole dollars, as money ("$185K", "$1.2M"), highest first', shape: [{ id: '', title: '', value_display: '' }] },
  ],
  action: {
    id: 'deals.headline',
    name: 'Open pipeline',
    data: { summary: {}, top: [] },
    layout: {
      component: 'Stack',
      props: { gap: 4 },
      children: [
        {
          component: 'Row',
          props: { justify: 'space-between', align: 'center' },
          children: [
            { component: 'Stat', props: { label: 'Open pipeline' }, children: '{{$.summary.total_display}}' },
            { component: 'Button', ref: 'newDeal', props: { variant: 'primary' }, children: 'New deal' },
          ],
        },
        {
          component: 'Table',
          props: {
            rows: '$.top',
            empty: 'No open deals.',
            rowKey: 'id',
            columns: [
              { label: 'Title', cell: { kind: 'primary', key: 'title' } },
              { label: 'Value', align: 'end', cell: { kind: 'text', key: 'value_display', mono: true } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:click', ref: 'newDeal', do: [{ push: { action: 'crm.deal.form' } }] },
      { message: 'deals-changed', do: [{ call: 'loadSummary' }, { call: 'loadTop' }] },
    ],
    endpoints: {
      loadSummary: { url: '/api/vex', method: 'POST', request: { fingerprint: FINGERPRINT }, target: 'summary' },
      loadTop: { url: '/api/vex', method: 'POST', request: { fingerprint: FINGERPRINT }, target: 'top' },
    },
    lifecycle: { mount: [{ call: 'loadSummary' }, { call: 'loadTop' }] },
  },
  probes: [{ do: [{ click: 'newDeal' }], opens: 'crm.deal.form' }],
};

export const EXAMPLES: readonly Example[] = [pickedMonth, searchBox, dateRange, headlineAndList];
