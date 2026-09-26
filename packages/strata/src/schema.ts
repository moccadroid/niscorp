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

export const StepSchema = z.discriminatedUnion('kind', [SqlStepSchema]);

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
    migrations: z
      .array(MigrationSchema)
      .describe('Append-only. A migration is numbered by its position (from 1); the sequence\'s version is its length.'),
  })
  .strict();

export type SqlStep = z.infer<typeof SqlStepSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Migration = z.infer<typeof MigrationSchema>;
export type Sequence = z.infer<typeof SequenceSchema>;
