// The standard response prism for a Vex resource (and for the write handlers,
// which reply with the same envelope). The reply is `{ result, ... }`; this
// lifts the data out of `result`. Attach it to an endpoint's `response`.
export const resultPrism = { $ref: '$.result' };
