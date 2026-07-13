import type { LayoutNode } from '@niscorp/nova';

// The company form body — the modal chrome is the `modal` fragment. Each field is
// two-way bound to the action data (`$.name`, …): the FORM's shape, not the
// table's. The `company.upsert` input prism maps it to DB columns.
export const companyFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', model: '$.name', props: { label: 'Name', placeholder: 'Company name', required: true } },
    { component: 'Input', model: '$.domain', props: { label: 'Domain', placeholder: 'example.com' } },
    // Option values MATCH the stored column values (see vex/seed.ts INDUSTRY /
    // SIZE) — otherwise an existing company's value won't pre-select on edit, and
    // saving would overwrite it with a non-matching slug.
    {
      component: 'Select',
      model: '$.industry',
      props: {
        label: 'Industry',
        placeholder: 'Select…',
        options: [
          { value: 'SaaS', label: 'SaaS' },
          { value: 'Fintech', label: 'Fintech' },
          { value: 'Healthcare', label: 'Healthcare' },
          { value: 'E-commerce', label: 'E-commerce' },
          { value: 'Manufacturing', label: 'Manufacturing' },
          { value: 'Logistics', label: 'Logistics' },
          { value: 'Media', label: 'Media' },
          { value: 'Energy', label: 'Energy' },
          { value: 'Education', label: 'Education' },
          { value: 'Real Estate', label: 'Real Estate' },
        ],
      },
    },
    {
      component: 'Select',
      model: '$.size',
      props: {
        label: 'Size',
        placeholder: 'Select…',
        options: [
          { value: '1-10', label: '1–10' },
          { value: '11-50', label: '11–50' },
          { value: '51-200', label: '51–200' },
          { value: '201-500', label: '201–500' },
          { value: '501-1000', label: '501–1000' },
          { value: '1000+', label: '1000+' },
        ],
      },
    },
    // The form's own footer — its buttons live here, in its layout, handled by
    // its action's `cancel`/`confirm` triggers. Renders on every canvas.
    {
      component: 'FormFoot',
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '$.confirmLabel' },
      ],
    },
  ],
};
