import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

// ═══════════════════════════════════════════════════════════
// Transform ops — rewriting a document rather than deriving a value.
//
// Built for migrations (strata document steps), useful anywhere a config must
// return its input with a precise edit: rename keys and keep their order, set
// one deep path and leave everything else alone, test whether a key is there at
// all (not "present and non-null"), refuse loudly, and rewrite every node of a
// tree whose depth nobody knows.
// ═══════════════════════════════════════════════════════════

const PathSchema = z
  .array(z.union([z.string(), z.number().int().nonnegative()]))
  .min(1)
  .describe('Literal path segments: object keys (strings) and array indexes (numbers).');

export const HasNodeSchema = z
  .object({
    $has: z
      .object({
        from: z.lazy(node).describe('The value to look into.'),
        path: PathSchema,
      })
      .strict(),
  })
  .strict()
  .describe('True when the whole path exists — a key present with a null value counts; a missing one does not.');
export type HasNode = z.infer<typeof HasNodeSchema>;

export const RenameKeysNodeSchema = z
  .object({
    $renameKeys: z
      .object({
        from: z.lazy(node).describe('The object whose keys to rename.'),
        map: z.record(z.string(), z.string()).describe('Old key → new key. Keys not listed, and listed keys that are absent, are left alone.'),
      })
      .strict(),
  })
  .strict()
  .describe(
    'The object with keys renamed IN PLACE — each renamed key keeps its position. If a new name is already a key of the object, that ' +
      'entry is replaced by the renamed one.',
  );
export type RenameKeysNode = z.infer<typeof RenameKeysNodeSchema>;

export const UpdateNodeSchema = z
  .object({
    $update: z
      .object({
        from: z.lazy(node).describe('The value to copy with one path changed.'),
        path: PathSchema,
        value: z
          .lazy(node)
          .describe('The new value at `path`. The value currently there (null when absent) is bound as `$var` `as`.'),
        as: z.string().min(1).optional().describe('The variable name the current value is bound to (default "current").'),
      })
      .strict(),
  })
  .strict()
  .describe(
    'A copy of `from` with the value at `path` replaced and everything else identical. Missing objects along a string path are created; ' +
      'an index that does not exist is an error.',
  );
export type UpdateNode = z.infer<typeof UpdateNodeSchema>;

export const AssertNodeSchema = z
  .object({
    $assert: z
      .object({
        when: z.lazy(node).describe('Must be truthy.'),
        message: z.string().min(1).describe('What went wrong, for a person — the whole error text.'),
        value: z.lazy(node).describe('Returned when `when` holds.'),
      })
      .strict(),
  })
  .strict()
  .describe('Fail with `message` (E_ASSERT) unless `when` is truthy; otherwise evaluate to `value`. How a migration refuses a shape it cannot handle.');
export type AssertNode = z.infer<typeof AssertNodeSchema>;

export const WalkNodeSchema = z
  .object({
    $walk: z
      .object({
        over: z.lazy(node).describe('The tree to rewrite — any JSON value.'),
        as: z.string().min(1).describe('The variable each visited node is bound to.'),
        rules: z
          .array(
            z
              .object({
                when: z.lazy(node).describe('Evaluated with the node bound to `as`; the first truthy rule wins.'),
                then: z.lazy(node).describe('The node\'s replacement.'),
              })
              .strict(),
          )
          .min(1)
          .describe('Tried in order at every node. No rule matches: the node is kept.'),
        order: z
          .enum(['post', 'pre'])
          .optional()
          .describe(
            'post (default): a node\'s children are rewritten first, and its rules see the rewritten children. pre: rules see the node as ' +
              'it was, then the walk descends into whatever they returned.',
          ),
      })
      .strict(),
  })
  .strict()
  .describe(
    'Rewrite every node of a tree — objects, arrays and leaves, at any depth — by rules. Structural: it always terminates, and a ' +
      'replacement is never walked again at its own level.',
  );
export type WalkNode = z.infer<typeof WalkNodeSchema>;
