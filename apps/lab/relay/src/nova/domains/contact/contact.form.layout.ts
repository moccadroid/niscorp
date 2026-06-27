import type { LayoutNode } from '@niscorp/nova';

// The contact form body — the modal chrome is the `modal` fragment. Shared by
// create and edit (seeded from the record). Bound to the action data — a single
// "Name" the input prism re-splits into first/last. Company is an id-bearing
// picker (options.companies).
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
    // The form's own footer — buttons here, handled by the action's triggers.
    {
      component: 'Row',
      props: { class: 'rl-form__foot' },
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '$.confirmLabel' },
      ],
    },
  ],
};
