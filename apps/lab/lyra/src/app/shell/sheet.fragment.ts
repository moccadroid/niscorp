import type { ActionFragment } from '@niscorp/nova';

export const sheetFragment: ActionFragment = {
  kind: 'fragment',
  id: 'sheet',
  layout: {
    component: 'Stack',
    props: { gap: 0 },
    children: [
      { slot: 'body' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'sheetClose', do: [{ pop: true }] },
  ],
};
