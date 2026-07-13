import type { LayoutNode } from '@niscorp/nova';

// The confirm dialog's content — the `modal` fragment supplies the backdrop,
// card, title and ✕; this is just the message and the Cancel / Delete
// buttons. Confirm announces `confirm-delete`; the list that opened it holds
// the id and runs the delete.
export const confirmDeleteLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 14 },
  children: [
    {
      component: 'Text',
      props: { size: 'sm', color: 'secondary' },
      children: 'This permanently deletes “{{$.label}}”. It can’t be undone.',
    },
    {
      component: 'Row',
      props: { class: 'fb-form__foot' },
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'danger', icon: 'trash' }, children: 'Delete' },
      ],
    },
  ],
};
