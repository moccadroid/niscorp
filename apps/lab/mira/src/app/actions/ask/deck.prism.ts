const selected = { $ref: '$.selected' };
const shifted = { $case: { branches: [{ when: { $lt: [{ $ref: '$.closing' }, selected] }, then: { $add: [selected, { $const: -1 }] } }], else: selected } };
const last = { $length: { $ref: '$.answers' } };

// After a picture is closed, the one picked stays picked, its position one less if the closed one stood before it; the
// closed one picked, its neighbour is.
export const pickAfterClosePrism: unknown = {
  $case: {
    branches: [
      { when: { $lt: [shifted, { $const: 1 }] }, then: { $const: 1 } },
      { when: { $gt: [shifted, last] }, then: last },
    ],
    else: shifted,
  },
};
