// The answer: the routed fingerprint, replayed as the asker. No context — a
// question's query carries its own filters.
export const answerPrism = {
  fingerprint: { $ref: '$.routed.fingerprint' },
  context: {},
};
