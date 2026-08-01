import type { ActionFragment } from '@niscorp/nova';

// The arrival mark, composed onto everything the assistant places — `apply`
// (server/assistant/contract.ts) is the only composer. It draws no chrome and
// answers no ref: one sheen when the instance mounts, inert after.
//
// Placement is what makes the timing honest. Reconcile mounts a NEW instance
// only for a new or re-aimed card, so a re-stated answer replays nothing, and
// a card the person opened themselves never wears this.
export const landedFragment: ActionFragment = {
  kind: 'fragment',
  id: 'landed',
  data: {},
  layout: { component: 'Landed', children: { slot: 'body' } },
};
