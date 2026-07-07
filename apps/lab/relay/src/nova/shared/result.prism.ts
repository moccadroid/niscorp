// The standard response prism for a Vex resource. Vex replies `{ result, meta }`;
// this lifts the data out of `result`. Attach it to an endpoint's `response`.
export const resultPrism = { $ref: '$.result' };
