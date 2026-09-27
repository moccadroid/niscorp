// THE SHAPES AN ANSWER CAN TAKE. Nobody types a shape: the router (Jev) picks
// one of these for a question, by what each `means`, and vex answers in it.
// Each comes with how the phone shows it — a list's columns, or one figure —
// so whatever the model writes, it lands in a layout written here.
//
// Flat, every one: a flat shape whose keys are single columns comes back from
// the query already in shape, and vex skips the mapping model for it.

// What the phone says about HOW its answer was reached — the point of the ask.
export const HOW_SAID: Record<string, string> = {
  replayed: 'Somebody asked this before. Their query was replayed for you — no model wrote anything.',
  generated: 'Nobody had asked this. A model wrote the query just now, under your clearance, and it is stored: the next person to ask gets it replayed.',
};

export type AskShape = {
  kind: string;
  means: string;
  shape: unknown;
  figure: boolean;
  columns: { label: string; key: string; w?: number; kind?: 'text' | 'mono' }[];
};

export const ASK_SHAPES: readonly AskShape[] = [
  {
    kind: 'list',
    means: 'A list of things, each with a name and a line about it — the answer to most "which" and "what" questions.',
    shape: [{ label: '', detail: '' }],
    figure: false,
    columns: [
      { label: 'Answer', key: 'label', w: 1 },
      { label: '', key: 'detail', w: 2 },
    ],
  },
  {
    kind: 'number',
    means: 'One number — how many, how much, how long.',
    shape: { value: 0 },
    figure: true,
    columns: [],
  },
  {
    kind: 'counts',
    means: 'A count for each group — how many per department, per title, per anything.',
    shape: [{ group: '', count: 0 }],
    figure: false,
    columns: [
      { label: 'Group', key: 'group', w: 2 },
      { label: 'How many', key: 'count', w: 1, kind: 'mono' },
    ],
  },
  {
    kind: 'people',
    means: 'People in the room — who they are: name, job title, department.',
    shape: [{ name: '', title: '', department: '' }],
    figure: false,
    columns: [
      { label: 'Name', key: 'name', w: 2 },
      { label: 'Title', key: 'title', w: 2 },
      { label: 'Department', key: 'department', w: 1 },
    ],
  },
];
