// ═══════════════════════════════════════════════════════════════
// THE PLACE IN A CHAIN OF EFFECTS A REQUEST NAMED.
//
// A tide effect that writes back through vex says where in a chain it is, in
// two headers of its request: `x-tide-cause`, the task that caused the write,
// and `x-tide-depth`, how many hops in that task is. They are this feature's
// headers, and it is this file that knows their names and reads them: the core
// hands on what a request said (../feature, the `onWrite` seam) and reads no
// header of anybody's.
//
// What they say is the caller's word. Whether it is believed is the app's
// `chain` gate (./feature.ts).
// ═══════════════════════════════════════════════════════════════

export type ChainHints = { cause: string; depth: number };

// HOW DEEP IN A CHAIN A REQUEST SAYS IT IS: a whole number that is not
// negative, written as `String(depth)` writes one — digits and nothing else.
// Read by its form and not with `Number()`, which reads more than a number:
// an empty header is 0 to it, and 0 is the start of a chain, so a chain whose
// depth is lost on the way would be counted from the beginning again, under a
// ceiling that exists to stop it. Undefined: the header names no depth.
const depthOf = (header: string | undefined): number | undefined => {
  if (header === undefined || !/^\d+$/.test(header)) return undefined;
  const depth = Number(header);
  return Number.isSafeInteger(depth) ? depth : undefined;
};

// The position a request named, or undefined when it named none that reads
// as one: no cause, an empty one, or a depth that is not a depth.
export const chainHintsOf = (request: { header: (name: string) => string | undefined }): ChainHints | undefined => {
  const cause = request.header('x-tide-cause');
  const depth = depthOf(request.header('x-tide-depth'));
  return cause === undefined || cause === '' || depth === undefined ? undefined : { cause, depth };
};
