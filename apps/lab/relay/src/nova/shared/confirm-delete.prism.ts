// Mutation input seam for the three list deletes. Each list stashes the row's id
// in `$.pendingDeleteId` when its ⋯ → Delete is clicked, opens the shared
// confirm dialog, and on `confirm-delete` calls its `<entity>.delete` endpoint —
// which maps that id to the mutation's `{ $context: 'id' }`. One prism serves all
// three because they share the `pendingDeleteId` convention.
const byPendingId = { id: { $ref: '$.pendingDeleteId' } };

export const deleteMutations: Record<string, unknown> = {
  'contact.delete': byPendingId,
  'company.delete': byPendingId,
  'deal.delete': byPendingId,
  'task.delete': byPendingId,
};
