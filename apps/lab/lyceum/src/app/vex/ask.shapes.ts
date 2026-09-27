// THE SHAPES AN ANSWER CAN TAKE. Nobody types a shape: the router (Jev) picks
// one of these for a question, by what each `means`, and vex answers in it —
// the shape a generated query is written to, and the one a replay must agree
// with. How each is SHOWN is the layouts' business
// (actions/shared/answer.layouts.ts), by its `kind`.
//
// Flat, every one: a flat shape whose keys are single columns comes back from
// the query already in shape, and vex skips the mapping model for it.

export type AskShape = {
  kind: string;
  means: string;
  shape: unknown;
};

export const ASK_SHAPES: readonly AskShape[] = [
  {
    kind: 'list',
    means: 'A list of things, each with a name and a line about it — the answer to most "which" and "what" questions.',
    shape: [{ label: '', detail: '' }],
  },
  {
    kind: 'number',
    means: 'One number — how many, how much, how long.',
    shape: { value: 0 },
  },
  {
    kind: 'counts',
    means: 'A count for each group — how many per department, per title, per anything.',
    shape: [{ group: '', count: 0 }],
  },
  {
    kind: 'people',
    means: 'People in the room — who they are: name, job title, department.',
    shape: [{ name: '', title: '', department: '' }],
  },
];
