import type { Sequence } from '@niscorp/strata';
import { StrataLab, type CodeEdit } from '@showroom/modules/strata/strata-lab';

// An app's own tables, as a sequence: two migrations, applied once, recorded.
// Boot, then boot again — the second finds nothing to do. Then change the code
// the ways a developer does, and boot after each:
//
//   · append a migration     → only the new one runs
//   · reword a comment       → nothing: comments are not the effect
//   · edit an applied one    → refused, EDITED — the database holds the old effect
//   · break a new one        → refused, STEP_FAILED — and the WHOLE run rolls back,
//                              including the good migration pending beside it
//   · roll the code back     → refused, TOO_NEW — newer code migrated this database
//
// "Boot · verify" is a production boot that expects a deploy step to have
// migrated already: it refuses pending work instead of doing it.

const people: Sequence = {
  id: 'acme.app',
  migrations: [
    { description: 'People', steps: [{ kind: 'sql', sql: 'CREATE TABLE people (\n  id   text PRIMARY KEY,\n  name text NOT NULL\n)' }] },
    { description: 'People can be archived', steps: [{ kind: 'sql', sql: 'ALTER TABLE people ADD COLUMN archived_at timestamptz' }] },
  ],
};

const onFirst = (code: readonly Sequence[], change: (s: Sequence) => Sequence): readonly Sequence[] =>
  code.map((s, i) => (i === 0 ? change(s) : s));

const edits: readonly CodeEdit[] = [
  {
    label: 'Append a migration',
    hint: 'A new column, as migration /3. Only it runs on the next boot.',
    apply: (code) =>
      onFirst(code, (s) => ({
        ...s,
        migrations: [...s.migrations, { description: 'People have an email', steps: [{ kind: 'sql', sql: 'ALTER TABLE people ADD COLUMN email text' }] }],
      })),
  },
  {
    label: 'Reword a comment',
    hint: 'A comment added to /1. Comments explain; they do not act — the checksum ignores them.',
    apply: (code) =>
      onFirst(code, (s) => ({
        ...s,
        migrations: s.migrations.map((m, i) =>
          i === 0 ? { ...m, steps: m.steps.map((step) => ({ ...step, sql: `-- Everyone the studio knows.\n${step.sql}` })) } : m,
        ),
      })),
  },
  {
    label: 'Edit an applied migration',
    hint: '/1 now creates a column it did not create before. Every database that ran /1 holds the old table.',
    apply: (code) =>
      onFirst(code, (s) => ({
        ...s,
        migrations: s.migrations.map((m, i) =>
          i === 0 ? { ...m, steps: [{ kind: 'sql' as const, sql: 'CREATE TABLE people (\n  id    text PRIMARY KEY,\n  name  text NOT NULL,\n  phone text\n)' }] } : m,
        ),
      })),
  },
  {
    label: 'Break a new migration',
    hint: 'A migration whose step fails. The run is one transaction: nothing from it lands.',
    apply: (code) =>
      onFirst(code, (s) => ({
        ...s,
        migrations: [...s.migrations, { description: 'Point people at their studio', steps: [{ kind: 'sql', sql: 'ALTER TABLE studios ADD COLUMN owner_id text' }] }],
      })),
  },
  {
    label: 'Roll the code back',
    hint: 'Ship the code from before /2. A database already at /2 was migrated by newer code.',
    apply: (code) => onFirst(code, (s) => ({ ...s, migrations: s.migrations.slice(0, 1) })),
  },
];

export const Demo = () => (
  <StrataLab
    code={[people]}
    edits={edits}
    tables={['people']}
    note="Boot, boot again, then change the code and boot after each change. Everything is real: a Postgres in this page, the runner a server uses, the ledger it writes."
  />
);
