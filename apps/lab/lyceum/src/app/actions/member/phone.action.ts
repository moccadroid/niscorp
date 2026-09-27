import type { ActionDefinition } from '@niscorp/nova';
import { phoneLayout } from './phone.layout';

// THE PHONE — what everybody in the room holds, whatever their department.
//
// The tabs are not authored per department. This lists EVERY candidate — the
// card, the four departments' tools, the ask — and `reconcile` places each as a
// tab on the `tabs` canvas; a candidate this shell does not hold is skipped,
// exactly as an ungranted `initial` candidate is. So the bar is ring 1 made
// visible: a neighbour in another department has other tabs, because their
// charter grants other actions, and nothing anywhere asks which department
// anybody is in. Being assigned rebuilds the shell (identity changed), this
// mounts again, and the new department's tool arrives as a tab.
export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: {
    tabs: [
      { action: 'member.card', input: { tab: true } },
      { action: 'records.register', input: { tab: true } },
      { action: 'forms.rename', input: { tab: true } },
      { action: 'inquiries.desk', input: { tab: true } },
      { action: 'archive.log', input: { tab: true } },
      { action: 'ask.desk', input: { tab: true } },
    ],
  },
  layout: phoneLayout,
  lifecycle: { mount: [{ reconcile: { canvas: 'tabs', to: '$.tabs', action: 'action', input: 'input', own: 'canvas' } }] },
  triggers: [],
};
