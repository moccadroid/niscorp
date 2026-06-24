import type { LayoutNode } from '@niscorp/nova';

// The deal form body — wrapped by the `modal` fragment at the push. Bound to the
// action data (the FORM's shape). Company / Stage / Primary contact are id-bearing
// selects: options load from `options.companies` / `options.stages` /
// `options.contacts`, and the Select reads each via valueKey/labelKey, so
// `$.company`/`$.stage`/`$.contact` hold real FK ids. Serves both create and edit
// — the difference is data (`$.saveFn` + whether the fields are seeded), not the
// form. Literal + serializable.
export const dealFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', model: '$.title', props: { label: 'Deal name', placeholder: 'e.g. Acme — Enterprise', required: true } },
    { component: 'Select', model: '$.company', props: { label: 'Company', placeholder: 'Select a company…', options: '$.companyOptions', valueKey: 'company_id', labelKey: 'name' } },
    {
      component: 'Row',
      props: { gap: 10 },
      children: [
        { component: 'Select', model: '$.stage', props: { label: 'Stage', placeholder: 'Select a stage…', required: true, options: '$.stageOptions', valueKey: 'stage_id', labelKey: 'name' } },
        { component: 'Input', model: '$.value', props: { label: 'Value', type: 'number', placeholder: '0' } },
      ],
    },
    {
      component: 'Row',
      props: { gap: 10 },
      children: [
        { component: 'Select', model: '$.contact', props: { label: 'Primary contact', placeholder: 'Select a contact…', options: '$.contactOptions', valueKey: 'contact_id', labelKey: 'name' } },
        { component: 'Input', model: '$.close_date', props: { label: 'Close date', type: 'date' } },
      ],
    },
  ],
};
