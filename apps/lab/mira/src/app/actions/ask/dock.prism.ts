const moved = (by: number): unknown => ({ $add: [{ $ref: '$.browse' }, { $const: by }] });
const last = { $ref: '$.current.total' };

const pickedPrism = (by: number): unknown => ({
  $case: {
    branches: [
      { when: { $lt: [moved(by), { $const: 1 }] }, then: { $const: 1 } },
      { when: { $gt: [moved(by), last] }, then: last },
    ],
    else: moved(by),
  },
});

export const pickBackPrism = pickedPrism(-1);
export const pickForwardPrism = pickedPrism(1);
