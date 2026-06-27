import type { LayoutNode } from '@niscorp/nova';

// A small, reusable destructive-confirm dialog — content only. The `panel`
// fragment supplies the backdrop + card (width from `$.panelClass`); this is just
// the header, message, and the Cancel / Delete buttons. The caller pushes it
// `with: ['panel']` and `input: { label, message }`. Confirm announces
// `confirm-delete`; the list that opened it holds the id and runs the delete.
export const confirmDeleteLayout: LayoutNode = [
  {
    component: 'Box',
    props: { class: 'rl-dialog__head' },
    children: [
      { component: 'Box', props: { class: 'rl-dialog__title' }, children: 'Delete {{$.label}}?' },
      { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
    ],
  },
  {
    component: 'Box',
    props: { class: 'rl-dialog__body' },
    children: { component: 'Text', props: { size: 'sm', color: 'secondary' }, children: '{{$.message}}' },
  },
  {
    component: 'Box',
    props: { class: 'rl-dialog__foot' },
    children: [
      { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
      { component: 'Button', ref: 'confirm', props: { variant: 'danger', icon: 'trash' }, children: 'Delete' },
    ],
  },
];
