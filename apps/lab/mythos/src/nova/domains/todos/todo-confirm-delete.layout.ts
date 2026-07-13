import type { LayoutNode } from '@niscorp/nova';

export const todoConfirmDeleteLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 12 },
  children: [
    { component: 'Text', props: { size: 'lg', weight: 'bold' }, children: 'Uproot “{{$.title}}”?' },
    {
      component: 'Text',
      props: { size: 'sm', tone: 'sub' },
      children: 'It comes out roots and all — it will never join the garden.',
    },
    {
      if: '$.error',
      then: { component: 'Text', props: { size: 'sm', tone: 'danger' }, children: '{{$.error}}' },
    },
    {
      component: 'Stack',
      props: { direction: 'row', justify: 'end', gap: 8 },
      children: [
        { component: 'Button', ref: 'cancel', props: { label: 'Keep it', variant: 'ghost' } },
        { component: 'Button', ref: 'confirm-delete', props: { label: 'Uproot', variant: 'danger' } },
      ],
    },
  ],
};
