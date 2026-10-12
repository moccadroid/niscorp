import type { ActionFragment } from '@niscorp/nova';

export const sheetFragment: ActionFragment = {
  kind: 'fragment',
  id: 'sheet',
  data: { sheetTitle: '' },
  layout: {
    component: 'Sheet',
    props: { title: '$.sheetTitle', closeRef: 'sheet-close' },
    children: { slot: 'body' },
  },
  triggers: [{ event: 'ui:click', ref: 'sheet-close', do: [{ pop: true }] }],
};
