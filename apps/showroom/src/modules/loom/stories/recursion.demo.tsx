import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// A recursive schema — a comment tree, where every node holds replies of its
// own shape. The parser stops at the cycle (a single `self` marker); the
// renderer emits one self-referencing template, and Nova resolves it against
// the data — so the editor goes exactly as deep as the document, never further.
// "Add" appends a default reply at *any* depth: grow the tree on the left and
// the JSON on the right grows with it. See the Definition tab for the template.

// `Comment` must be one stable reference — the getter and the wrapper both name
// the same const, so the parser recognizes the cycle by identity. The return
// annotation breaks the circular type inference.
const Comment = z.object({
  author: z.string().meta({ title: 'Author' }),
  body: z.string().meta({ title: 'Body' }),
  get replies(): z.ZodType {
    return z.array(Comment).meta({ title: 'Replies' });
  },
});

export const schema = z.object({ thread: Comment }).meta({ title: 'Discussion' });

const initial = {
  thread: {
    author: 'Ada',
    body: 'Loom edits recursive schemas now.',
    replies: [
      {
        author: 'Grace',
        body: 'At any depth?',
        replies: [{ author: 'Ada', body: 'At any depth.', replies: [] }],
      },
    ],
  },
};

export const Demo = () => <SchemaDemo schema={schema} value={initial} />;
