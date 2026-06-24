import type { LayoutNode } from '@niscorp/nova';

// A small, reusable destructive-confirm dialog. It carries its OWN chrome (not
// the `modal` fragment) so the action button can be `danger`, not primary. The
// caller pushes it with `input: { label, message }` — `label` names the record
// in the title, `message` spells out the consequence (e.g. a company also takes
// its contacts and deals). Confirm announces `confirm-delete`; the list that
// opened it holds the id and runs the actual delete.
export const confirmDeleteLayout: LayoutNode = {
  component: 'Overlay',
  children: {
    component: 'Box',
    props: { class: 'rl-dialog rl-dialog--narrow' },
    children: [
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
    ],
  },
};
