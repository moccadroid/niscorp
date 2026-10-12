import type { LayoutNode } from '@niscorp/nova';

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
    {
      component: 'FormFoot',
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '$.confirmLabel' },
      ],
    },
  ],
};
