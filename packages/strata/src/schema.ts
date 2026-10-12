import { z } from 'zod';

export const SEQUENCE_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export const MIGRATION_REF = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+\/[1-9][0-9]*$/;

export const KIND_NAME = /^[a-z][a-z0-9-]*$/;
export const KIND_REF = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+\/[a-z][a-z0-9-]*$/;

// `children[]` crosses the array at `children`, `endpoints.*` the record at
// `endpoints`. Two wildcards, not one: nova's `children` is a single node or an
// array, and one for both would read a lone node's `props` as layouts.
export const EMBED_PATH = /^([A-Za-z_$][\w$]*|\*)(\[\])?(\.([A-Za-z_$][\w$]*|\*)(\[\])?)*$/;

export const SqlStepSchema = z
  .object({
    kind: z.literal('sql'),
    sql: z
      .string()
      .min(1)
      .describe(
        'ONE SQL statement. A driver that prepares statements (PGlite, pg with parameters) refuses a string ' +
          'carrying several — split them into steps rather than joining them with semicolons.',
      ),
  })
  .strict()
  .describe('A statement run against the database, inside the migration transaction.');

export const DocumentStepSchema = z
  .object({
    kind: z.literal('document'),
    at: z
      .string()
      .regex(KIND_REF)
      .describe('The kind of document this step rewrites, e.g. "nisc.nova/layout" — wherever one sits, at any depth.'),
    transform: z
      .unknown()
      .describe(
        'A transform config (Prism) run by the injected evaluator over { document, path }: `document` is ONE document of ' +
          'the `at` kind, `path` where it sits. It returns that document rewritten. Nested documents are found by the ' +
          'grammar\'s embeddings and rewritten on their own, deepest first — a transform only ever sees one flat node.',
      ),
  })
  .strict()
  .describe('A rewrite of stored JSON documents of one kind.');

export const StepSchema = z.discriminatedUnion('kind', [SqlStepSchema, DocumentStepSchema]);

export const DocumentKindSchema = z
  .object({
    embeds: z
      .record(z.string().regex(EMBED_PATH), z.string().regex(KIND_REF))
      .optional()
      .describe('Where other documents sit inside this one: path → the kind found there (possibly this kind itself).'),
  })
  .strict();

export const MigrationSchema = z
  .object({
    description: z
      .string()
      .min(1)
      .describe('One sentence: what this migration does. It is the changelog line and the ledger\'s description.'),
    steps: z
      .array(StepSchema)
      .describe(
        'Applied in order, in the same transaction as every other pending migration. Empty is a MARKER: ' +
          'the version moves and nothing runs — how an addition to a strict grammar tells older readers to refuse.',
      ),
    dependsOn: z
      .array(z.string().regex(MIGRATION_REF))
      .optional()
      .describe('Migrations of OTHER sequences that must be applied first, each as "<sequence>/<n>".'),
  })
  .strict();

export const SequenceSchema = z
  .object({
    id: z.string().regex(SEQUENCE_ID).describe('Namespaced and lowercase, e.g. "nisc.vex.cache" or "midas.app".'),
    documents: z
      .record(z.string().regex(KIND_NAME), DocumentKindSchema)
      .optional()
      .describe('The document kinds this sequence owns (a GRAMMAR sequence), each named "<id>/<kind>" elsewhere.'),
    migrations: z
      .array(MigrationSchema)
      .describe('Append-only. A migration is numbered by its position (from 1); the sequence\'s version is its length.'),
  })
  .strict()
  // Not both: a table sequence's version is recorded per database, a grammar
  // sequence's per document (its stamp), and one number cannot be both.
  .superRefine((sequence, ctx) => {
    const kinds = new Set(sequence.migrations.flatMap((m) => m.steps.map((s) => s.kind)));
    if (kinds.has('sql') && (kinds.has('document') || sequence.documents !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'A sequence either owns tables (sql steps) or documents (document steps and `documents`), not both.',
      });
    }
  });

export type SqlStep = z.infer<typeof SqlStepSchema>;
export type DocumentStep = z.infer<typeof DocumentStepSchema>;
export type DocumentKind = z.infer<typeof DocumentKindSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Migration = z.infer<typeof MigrationSchema>;
export type Sequence = z.infer<typeof SequenceSchema>;
