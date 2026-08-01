import type { ActionFragment } from '@niscorp/nova';

// What a record on the `detail` column gains: it closes when the person changes
// what they are working on.
//
// A top-level nav item is a RESET — picking Messages while an issue is open
// should not leave that issue beside the inbox. The menu emits `work-reset`; the
// record answers it. As a FRAGMENT rather than a trigger on each surface,
// because "close when the work changes" is a property of being IN this column,
// not of being an issue or a thread or a form. A vendor shipping a detail
// surface gets it by landing there.
//
// `removeSelf` and not `pop`: a form may be stacked over the record it concerns,
// and both should go — each closes itself, so the whole column empties without
// anybody counting how deep it was.
export const detailFragment: ActionFragment = {
  kind: 'fragment',
  id: 'detail',
  data: {},
  layout: { slot: 'body' },
  triggers: [{ message: 'work-reset', do: [{ removeSelf: true }] }],
};
