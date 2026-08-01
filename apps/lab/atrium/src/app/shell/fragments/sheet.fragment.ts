import type { ActionFragment } from '@niscorp/nova';

// The overlay chrome, composed onto an action when it is pushed onto the `sheet`
// canvas (`with: ['sheet']`). Modality is arrangement — an action on an overlay
// canvas wearing this fragment — never a `$.open` flag inside an action.
//
// `sheetTitle` comes in as input from whatever opened it, which is how one
// fragment titles eight different actions without knowing what any of them are.
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
