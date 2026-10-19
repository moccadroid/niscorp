import type { Example } from '@relay/screen-builder';

const FINGERPRINT = '<the fingerprint prove answered>';

const settled = { onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] };

const pickedSize: Example = {
  intent: 'Companies of a size picked from a dropdown (1-10, 11-50, 51-200); picking one reloads the table; clicking a row opens the company.',
  prove: [
    {
      intent: 'companies whose size equals size, with name, industry and size, ordered by name, up to 200',
      shape: [{ id: '', name: '', industry: '', size: '' }],
      context: { size: '1-10' },
    },
  ],
  action: {
    id: 'companies.by-size',
    name: 'Companies by size',
    data: { companies: [], loading: true, size: '1-10' },
    layout: {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        {
          component: 'Row',
          props: { justify: 'space-between', align: 'center' },
          children: [
            { component: 'Text', props: { size: 'sm' }, children: '{{$.companies.length}} companies' },
            { component: 'Select', ref: 'size', model: '$.size', props: { label: 'Size', options: [{ value: '1-10', label: '1-10' }, { value: '11-50', label: '11-50' }, { value: '51-200', label: '51-200' }] } },
          ],
        },
        {
          component: 'Table',
          props: {
            rows: '$.companies',
            loading: '$.loading',
            empty: 'No company of this size.',
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
      { event: 'ui:model', ref: 'size', do: [{ set: 'loading', value: true }, { call: 'load', ...settled }] },
      { message: 'companies-changed', do: [{ call: 'load', ...settled }] },
      { event: 'ui:click', ref: 'companyRow', do: [{ push: { action: 'crm.company.view', input: { id: '@event.payload' } } }] },
    ],
    endpoints: {
      load: { url: '/api/vex', method: 'POST', request: { fingerprint: FINGERPRINT, context: { size: { $ref: '$.size' } } }, target: 'companies' },
    },
    lifecycle: { mount: [{ call: 'load', ...settled }] },
  },
  probes: [
    { holds: [{ in: 'companies', field: 'size', is: '1-10' }, { in: 'companies', field: 'name', sorted: 'asc' }] },
    { do: [{ set: 'size', to: '11-50' }], changes: 'companies', holds: [{ in: 'companies', field: 'size', is: '11-50' }] },
    { do: [{ click: 'companyRow' }], opens: 'crm.company.view' },
  ],
};

const contactSearch: Example = {
  intent: 'All contacts with first name, last name, email and company; typing in a search box narrows them by last name; clicking a row opens the contact.',
  prove: [
    {
      intent: 'contacts whose last name matches the pattern q, with first name, last name, email and company name, ordered by last name, up to 500',
      shape: [{ id: '', first_name: '', last_name: '', email: '', company: '' }],
      context: { q: '%an%' },
    },
  ],
  action: {
    id: 'contacts.search',
    name: 'Find a contact',
    data: { contacts: [], search: '' },
    layout: {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        { component: 'Input', ref: 'search', model: '$.search', props: { placeholder: 'Search by last name', icon: 'search', debounce: 200 } },
        {
          component: 'Table',
          props: {
            rows: '$.contacts',
            empty: 'No contact matches.',
            rowKey: 'id',
            rowRef: 'contactRow',
            columns: [
              { label: 'Last name', cell: { kind: 'primary', key: 'last_name' } },
              { label: 'First name', cell: { kind: 'text', key: 'first_name' } },
              { label: 'Email', hideNarrow: true, cell: { kind: 'text', key: 'email' } },
              { label: 'Company', hideNarrow: true, cell: { kind: 'text', key: 'company' } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:model', ref: 'search', do: [{ call: 'load' }] },
      { message: 'contacts-changed', do: [{ call: 'load' }] },
      { event: 'ui:click', ref: 'contactRow', do: [{ push: { action: 'crm.contact.view', input: { id: '@event.payload' } } }] },
    ],
    endpoints: {
      load: {
        url: '/api/vex',
        method: 'POST',
        request: { fingerprint: FINGERPRINT, context: { q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } } },
        target: 'contacts',
      },
    },
    lifecycle: { mount: [{ call: 'load' }] },
  },
  probes: [
    { holds: [{ in: 'contacts', field: 'last_name', sorted: 'asc' }] },
    { do: [{ set: 'search', to: 'an' }], changes: 'contacts' },
    { do: [{ click: 'contactRow' }], opens: 'crm.contact.view' },
  ],
};

const activitiesBetween: Example = {
  intent: 'Activities that happened between two dates the person picks, newest first, with type, subject and when; changing either date reloads the table.',
  prove: [
    {
      intent: 'activities whose day of occurrence is on or after start and on or before end, with type, subject and the moment they occurred, newest first, up to 500',
      shape: [{ id: '', type: '', subject: '', occurred_at: '', occurred_display: { $date: { value: { $ref: '$.occurred_at' }, format: 'MMM D' } } }],
      context: { start: '2026-09-01', end: '2026-09-30' },
    },
  ],
  action: {
    id: 'activities.between',
    name: 'Activities between',
    data: { activities: [], start: '2026-09-01', end: '2026-09-30' },
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
            rows: '$.activities',
            empty: 'Nothing happened between these dates.',
            rowKey: 'id',
            columns: [
              { label: 'Type', cell: { kind: 'badge', key: 'type' } },
              { label: 'Subject', cell: { kind: 'primary', key: 'subject' } },
              { label: 'When', cell: { kind: 'text', key: 'occurred_display' } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:model', ref: 'start', do: [{ call: 'load' }] },
      { event: 'ui:model', ref: 'end', do: [{ call: 'load' }] },
    ],
    endpoints: {
      load: { url: '/api/vex', method: 'POST', request: { fingerprint: FINGERPRINT, context: { start: { $ref: '$.start' }, end: { $ref: '$.end' } } }, target: 'activities' },
    },
    lifecycle: { mount: [{ call: 'load' }] },
  },
  probes: [
    { holds: [{ in: 'activities', field: 'occurred_at', sorted: 'desc' }, { in: 'activities', field: 'occurred_at', from: '2026-09-01', to: '2026-09-30 23:59' }] },
    { do: [{ set: 'start', to: '2026-09-15' }], changes: 'activities', holds: [{ in: 'activities', field: 'occurred_at', from: '2026-09-15' }] },
    { do: [{ set: 'end', to: '2026-09-10' }], changes: 'activities', holds: [{ in: 'activities', field: 'occurred_at', to: '2026-09-10 23:59' }] },
  ],
};

const openTasksHeadline: Example = {
  intent: 'How many of my tasks are open, as a headline number, my five next open tasks below it with title and due date, and a button that opens the form for a new task.',
  prove: [
    { intent: 'the number of my open tasks', shape: { open: 0 } },
    { intent: 'my five open tasks with the earliest due date, with title and due date, earliest first', shape: [{ id: '', title: '', due_date: '', due_display: { $date: { value: { $ref: '$.due_date' }, format: 'MMM D' } } }] },
  ],
  action: {
    id: 'tasks.headline',
    name: 'My open tasks',
    data: { summary: {}, next: [] },
    layout: {
      component: 'Stack',
      props: { gap: 4 },
      children: [
        {
          component: 'Row',
          props: { justify: 'space-between', align: 'center' },
          children: [
            { component: 'Stat', props: { label: 'Open tasks' }, children: '{{$.summary.open}}' },
            { component: 'Button', ref: 'newTask', props: { variant: 'primary' }, children: 'New task' },
          ],
        },
        {
          component: 'Table',
          props: {
            rows: '$.next',
            empty: 'Nothing is due.',
            rowKey: 'id',
            columns: [
              { label: 'Title', cell: { kind: 'primary', key: 'title' } },
              { label: 'Due', cell: { kind: 'text', key: 'due_display' } },
            ],
          },
        },
      ],
    },
    triggers: [
      { event: 'ui:click', ref: 'newTask', do: [{ push: { action: 'tasks.form' } }] },
      { message: 'tasks-changed', do: [{ call: 'loadSummary' }, { call: 'loadNext' }] },
    ],
    endpoints: {
      loadSummary: { url: '/api/vex', method: 'POST', request: { fingerprint: FINGERPRINT }, target: 'summary' },
      loadNext: { url: '/api/vex', method: 'POST', request: { fingerprint: FINGERPRINT }, target: 'next' },
    },
    lifecycle: { mount: [{ call: 'loadSummary' }, { call: 'loadNext' }] },
  },
  probes: [
    { holds: [{ in: 'next', atMost: 5 }, { in: 'next', field: 'due_date', sorted: 'asc' }] },
    { do: [{ click: 'newTask' }], opens: 'tasks.form' },
  ],
};

export const EXAMPLES: readonly Example[] = [pickedSize, contactSearch, activitiesBetween, openTasksHeadline];
