import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// Inputs with one-way `value` bindings via `{{…}}` templates. No
// `model`, so typing doesn't write back to the data. The last
// input is disabled with a static value — the read-only style.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12, padding: 24 },
  children: [
    { component: 'Input', props: { value: '{{$.firstName}}', placeholder: 'First name' } },
    { component: 'Input', props: { value: '{{$.lastName}}', placeholder: 'Last name' } },
    { component: 'Input', props: { value: '{{$.email}}', placeholder: 'Email' } },
    { component: 'Input', props: { value: 'Read only', disabled: true } },
  ],
};

const data = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
};

export { layout, data };

export const Demo = () => <Nova.Layout layout={layout} data={data} />;
