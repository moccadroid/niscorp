import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// The grammar of a migration.
//
// A SEQUENCE is an append-only list of migrations owned by one grammar owner —
// a package's tables (`nisc.vex.cache`), a package's documents (`nisc.nova`,
// later), an app's own (`midas.app`). A migration's number is its POSITION, so
// the sequence's version is its length: nobody bumps a number, you append.
//
// Sequences are data. They are authored in TS for type-checking, but nothing
// here is a function, so a sequence can be stored, shipped and inspected like
// every other nisc artifact — and is parsed at the boundary like one.
// ═══════════════════════════════════════════════════════════════

// Namespaced, lowercase: `<owner>.<name>[.<name>…]`. The owner prefix keeps two
// packages (or a package and an app) from ever claiming the same sequence.
export const SEQUENCE_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

// `<sequence>/<n>` — how a migration is named everywhere: the ledger, a
// dependency, an error.
export const MIGRATION_REF = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+\/[1-9][0-9]*$/;

// A document kind, named by its owner: `<sequence>/<kind>`, e.g.
// "nisc.nova/layout". The kind part is a plain lowercase word.
export const KIND_NAME = /^[a-z][a-z0-9-]*$/;
export const KIND_REF = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+\/[a-z][a-z0-9-]*$/;

// Where, inside a document, another document sits. Dot-separated keys, with
// two wildcards that say WHICH shape they cross — `children[]` is every item of
// the array at `children`, `endpoints.*` every value of the record at
// `endpoints`. Kept apart on purpose: nova's `children` is a single node OR an
// array, and one wildcard for both would read a lone node's `props` as layouts.
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
  // TWO KINDS OF OWNER. A table sequence (sql steps) is recorded per DATABASE,
  // in its ledger. A grammar sequence (document steps) is tracked per DOCUMENT,
  // by the stamp the document carries — because documents travel: an add-on
  // built on older code submits older documents to a newer host. One sequence
  // cannot be both; the two versions would mean different things.
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
