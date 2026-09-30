// THE SHAPES AN ANSWER CAN TAKE. Nobody types a shape: the router (Jev) picks
// one of these for a question, by each one's `description`, and vex answers in it —
// the shape a generated query is written to, and the one a replay must agree
// with. How each is SHOWN is the layouts' business
// (actions/shared/answer.layouts.ts), by its `kind`.
//
// Flat, every one: a flat shape whose keys are single columns comes back from
// the query already in shape, and vex skips the mapping model for it.

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
    description: 'A count for each group — how many per title, per hour, per anything.',
    shape: [{ group: '', count: 0 }],
  },
  {
    kind: 'people',
    description: 'People in the audience — who they are: name and job title.',
    shape: [{ name: '', title: '' }],
  },
];
