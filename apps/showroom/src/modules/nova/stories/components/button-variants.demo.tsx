import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// A row of Buttons covering each variant plus a disabled state.

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 12, padding: 24, align: 'center' },
  children: [
    { component: 'Button', props: { variant: 'primary' }, children: 'Primary' },
    { component: 'Button', props: { variant: 'secondary' }, children: 'Secondary' },
    { component: 'Button', props: { variant: 'ghost' }, children: 'Ghost' },
    { component: 'Button', props: { variant: 'primary', disabled: true }, children: 'Disabled' },
  ],
};

export { layout };

export const Demo = () => <Nova.Layout layout={layout} />;
