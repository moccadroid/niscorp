import type { LayoutNode } from '@niscorp/nova';

// A small, reusable destructive-confirm dialog — content only. The `panel`
// fragment supplies the backdrop + card (width from `$.panelSize`); this is just
// the header, message, and the Cancel / Delete buttons. The caller pushes it
// `with: ['panel']` and `input: { label, message }`. Confirm announces
// `confirm-delete`; the list that opened it holds the id and runs the delete.
export const confirmDeleteLayout: LayoutNode = [
  {
    component: 'DialogHead',
    children: [
      { component: 'DialogTitle', children: 'Delete {{$.label}}?' },
      { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
    ],
  },
  {
    component: 'DialogBody',
    children: { component: 'Text', props: { size: 'sm', color: 'secondary' }, children: '{{$.message}}' },
  },
  {
    component: 'DialogFoot',
    children: [
      { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
      { component: 'Button', ref: 'confirm', props: { variant: 'danger', icon: 'trash' }, children: 'Delete' },
    ],
  },
];
