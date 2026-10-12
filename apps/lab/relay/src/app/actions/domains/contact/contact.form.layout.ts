import type { LayoutNode } from '@niscorp/nova';

export const contactFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', model: '$.name', props: { label: 'Name', placeholder: 'Full name', required: true } },
    {
      component: 'Row',
      props: { gap: 10 },
      children: [
        { component: 'Input', model: '$.email', props: { label: 'Email', type: 'email', placeholder: 'name@company.com' } },
        { component: 'Input', model: '$.phone', props: { label: 'Phone', type: 'tel', placeholder: '+1 (555) 000-0000' } },
      ],
    },
    {
      component: 'Row',
      props: { gap: 10 },
      children: [
        { component: 'Input', model: '$.title', props: { label: 'Title', placeholder: 'Role' } },
        { component: 'Select', model: '$.company', props: { label: 'Company', placeholder: 'Select a company…', options: '$.companyOptions', valueKey: 'company_id', labelKey: 'name' } },
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
