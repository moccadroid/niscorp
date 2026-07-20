import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// Nonexistent paths resolve to empty strings inside templates —
// the layout still renders cleanly even when the data is partial.
// No throws, no "undefined" leaking into the UI.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 8, padding: 24 },
  children: [
    { component: 'Text', children: 'Existing: {{$.existing}}' },
    { component: 'Text', children: 'Missing template: <{{$.missing.deep.path}}>' },
    { component: 'Text', children: '$.also.missing' },
  ],
};

const data = { existing: 'I am here' };

export { layout, data };

export const Demo = () => <Nova.Layout layout={layout} data={data} />;
