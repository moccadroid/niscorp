import type { ActionFragment } from '@niscorp/nova';

export const landedFragment: ActionFragment = {
  kind: 'fragment',
  id: 'landed',
  data: {},
  layout: { component: 'Landed', children: { slot: 'body' } },
};
