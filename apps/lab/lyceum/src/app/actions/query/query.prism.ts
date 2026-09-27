// The result: the routed fingerprint, replayed as the caller. No context — a
// request's query carries its own filters.
export const resultPrism = {
  fingerprint: { $ref: '$.routed.fingerprint' },
  context: {},
};
