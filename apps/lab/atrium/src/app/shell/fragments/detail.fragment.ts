import type { ActionFragment } from '@niscorp/nova';

// `removeSelf` and not `pop`: a form may be stacked over the record it concerns,
// and each closes itself, so the whole column empties.
export const detailFragment: ActionFragment = {
  kind: 'fragment',
  id: 'detail',
  data: {},
  layout: { slot: 'body' },
  triggers: [{ message: 'work-reset', do: [{ removeSelf: true }] }],
};
