// THE SHAPES AN ANSWER CAN TAKE. Nobody types a shape: the router (Jev) picks
// one of these for a question, by each one's `description`, and vex answers in it —
// the shape a generated query is written to, and the one a replay must agree
// with. How each is SHOWN is the layouts' business
// (actions/shared/answer.layouts.ts), by its `kind`.
//
// Flat, every one Jev picks from: a flat shape whose keys are single columns
// comes back from the query already in shape, and vex skips the mapping agent
// for it.
//
// A request can also carry its shape: the speaker's ask can give one
// (actions/ask/), and then Jev is not asked for it. The one shape that is only
// ever given is nested — a query returns flat rows, so they are never it, and
// the mapping agent writes a mapping, once, stored with the query.

export type QueryShape = {
  kind: string;
  description: string;
  shape: unknown;
};

export const QUERY_SHAPES: readonly QueryShape[] = [
  {
    kind: 'list',
    description: 'A list of things, each with a name and a line about it — the answer to most "which" and "what" questions.',
    shape: [{ label: '', detail: '' }],
  },
  {
    kind: 'number',
    description: 'One number — how many, how much, how long.',
    shape: { value: 0 },
  },
  {
    kind: 'counts',
    description: 'A count for each group — how many per person, per hour, per anything.',
    shape: [{ group: '', count: 0 }],
  },
  {
    kind: 'people',
    description: 'People in the audience — who they are, by the names they chose.',
    shape: [{ name: '' }],
  },
];

export const GIVEN_SHAPE: QueryShape = {
  kind: 'timeline',
  description: 'A name and a time a row, the name nested.',
  shape: [{ who: { name: '' }, at: '' }],
};

export const ALL_SHAPES: readonly QueryShape[] = [...QUERY_SHAPES, GIVEN_SHAPE];
export const shapeOfKind = (kind: string): QueryShape | undefined => ALL_SHAPES.find((entry) => entry.kind === kind);
