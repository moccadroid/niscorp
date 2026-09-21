import type { LayoutNode } from '@niscorp/nova';

// Bottom right, small, and the same control in both modes. `Hotkey` is the kit's
// one keyboard primitive: it turns a key pressed anywhere (but not while typing
// in a field) into the same click.
export const roomXrayLayout: LayoutNode = {
  component: 'Row',
  props: { gap: 8, align: 'center', justify: 'end' },
  children: [
    { component: 'Hotkey', ref: 'hotkey', props: { value: '`' } },
    { component: 'OnLoad', ref: 'fresh', props: { when: '$.on' } },
    { if: '$.on', then: { component: 'Button', ref: 'toggle', props: { label: 'x-ray on', variant: 'ghost' } }, else: { component: 'Button', ref: 'toggle', props: { label: 'x-ray', variant: 'quiet' } } },
  ],
};
