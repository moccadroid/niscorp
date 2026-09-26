import { SequenceSchema, type DocumentKind, type Sequence, type Step } from './schema';
import { checksumOf } from './checksum';
import { StrataError, type StrataErrorCode } from './errors';

// ═══════════════════════════════════════════════════════════════
// The plan — what the code says, against what the database has run.
//
// Pure: sequences and ledger rows in, a plan out. No database, no clock. The
// postgres runner reads the ledger, calls this, and applies what it says; a
// showroom page or a CI check can call it with a ledger it made up.
// ═══════════════════════════════════════════════════════════════

// A migration the code declares, numbered and hashed.
export type PreparedMigration = {
  sequence: string;
  n: number;
  ref: string;
  description: string;
  checksum: string;
  steps: readonly Step[];
  dependsOn: readonly string[];
};

export type PreparedSequence = {
  id: string;
  // A grammar sequence owns documents (tracked by stamps); otherwise it owns
  // tables (tracked by a database's ledger). See SequenceSchema.
  grammar: boolean;
  documents: Readonly<Record<string, DocumentKind>>;
  migrations: readonly PreparedMigration[];
};

// One row of the ledger, as a runner read it back.
export type LedgerRow = { sequence: string; n: number; checksum: string; description: string; appliedAt: string };

export type Problem = { code: Exclude<StrataErrorCode, 'PENDING' | 'STEP_FAILED' | 'NO_TRANSACTION' | 'UNKNOWN_KIND' | 'WRONG_OWNER'>; detail: string };

export type Plan = {
  // Already run, per sequence this code knows: how far each one is.
  applied: Readonly<Record<string, number>>;
  // To run, in the order they must run.
  pending: readonly PreparedMigration[];
  // Anything that makes applying unsafe. A plan with problems is never applied.
  problems: readonly Problem[];
};

const refOf = (sequence: string, n: number): string => `${sequence}/${n}`;

// Parse, number and hash. Async only for the hash (WebCrypto).
export const prepare = async (sequences: readonly Sequence[]): Promise<readonly PreparedSequence[]> => {
  const seen = new Set<string>();
  const prepared: PreparedSequence[] = [];
  for (const input of sequences) {
    const parsed = SequenceSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      throw new StrataError('INVALID_SEQUENCE', `A sequence does not parse${typeof input.id === 'string' ? ` ("${input.id}")` : ''}.`, issues);
    }
    const sequence = parsed.data;
    if (seen.has(sequence.id)) {
      throw new StrataError('INVALID_SEQUENCE', `Two sequences are both called "${sequence.id}" — a sequence id names one owner.`);
    }
    seen.add(sequence.id);
    const migrations: PreparedMigration[] = [];
    for (const [index, migration] of sequence.migrations.entries()) {
      const n = index + 1;
      migrations.push({
        sequence: sequence.id,
        n,
        ref: refOf(sequence.id, n),
        description: migration.description,
        checksum: await checksumOf(migration),
        steps: migration.steps,
        dependsOn: migration.dependsOn ?? [],
      });
    }
    const grammar = sequence.documents !== undefined || sequence.migrations.some((m) => m.steps.some((s) => s.kind === 'document'));
    prepared.push({ id: sequence.id, grammar, documents: sequence.documents ?? {}, migrations });
  }
  return prepared;
};

// Order: walk the sequences in the order given, and let each run as far as its
// dependencies allow before moving on; repeat until nothing moves. The same
// input always yields the same order, and a sequence's own migrations stay
// together unless a dependency splits them. Shared by the ledger's plan and a
// document's upgrade, so both order the same migrations the same way.
export const orderPending = (
  queues: readonly { waiting: readonly PreparedMigration[] }[],
  alreadyDone: ReadonlySet<string>,
): { pending: PreparedMigration[]; stuck: PreparedMigration[] } => {
  const done = new Set(alreadyDone);
  const waiting = queues.map((q) => [...q.waiting]);
  const pending: PreparedMigration[] = [];
  let moved = true;
  while (moved) {
    moved = false;
    for (const queue of waiting) {
      for (let head = queue[0]; head !== undefined; head = queue[0]) {
        if (!head.dependsOn.every((d) => done.has(d))) break;
        pending.push(head);
        done.add(head.ref);
        queue.shift();
        moved = true;
      }
    }
  }
  return { pending, stuck: waiting.flat() };
};

export const planMigrations = (sequences: readonly PreparedSequence[], ledger: readonly LedgerRow[]): Plan => {
  const problems: Problem[] = [];
  const applied: Record<string, number> = {};
  const done = new Set(ledger.map((row) => refOf(row.sequence, row.n)));
  const byRef = new Map(ledger.map((row) => [refOf(row.sequence, row.n), row]));

  const queues: { id: string; waiting: PreparedMigration[] }[] = [];
  for (const sequence of sequences) {
    const rows = ledger.filter((row) => row.sequence === sequence.id);
    applied[sequence.id] = rows.length;

    // The database ran migrations this code has never seen: newer code migrated
    // it. Applying ours on top would be guessing — refuse.
    const beyond = rows.filter((row) => row.n > sequence.migrations.length);
    if (beyond.length > 0) {
      problems.push({
        code: 'TOO_NEW',
        detail: `${sequence.id}: the database is at ${Math.max(...rows.map((r) => r.n))}, this code knows ${sequence.migrations.length} — it was migrated by newer code.`,
      });
    }

    const waiting: PreparedMigration[] = [];
    for (const migration of sequence.migrations) {
      const row = byRef.get(migration.ref);
      if (row === undefined) {
        waiting.push(migration);
      } else if (row.checksum !== migration.checksum) {
        problems.push({
          code: 'EDITED',
          detail: `${migration.ref} ("${migration.description}") was applied ${row.appliedAt} and its steps have changed since. An applied migration is history — append a new one.`,
        });
      }
    }
    // A hole: something later ran, something earlier did not. The ledger was
    // written by hand, or by a different ordering of the same sequence.
    const firstWaiting = waiting[0];
    if (firstWaiting !== undefined && rows.some((row) => row.n > firstWaiting.n)) {
      problems.push({ code: 'EDITED', detail: `${sequence.id}: ${firstWaiting.ref} never ran, but a later migration of the sequence did.` });
    }
    queues.push({ id: sequence.id, waiting });
  }

  // Every dependency must be satisfiable by the ledger or by this plan.
  const provided = new Set(sequences.flatMap((s) => s.migrations.map((m) => m.ref)));
  for (const { waiting } of queues) {
    for (const migration of waiting) {
      for (const dependency of migration.dependsOn) {
        if (!done.has(dependency) && !provided.has(dependency)) {
          problems.push({ code: 'UNKNOWN_DEPENDENCY', detail: `${migration.ref} depends on ${dependency}, which nothing provides and the database has not run.` });
        }
      }
    }
  }

  const { pending, stuck } = orderPending(queues, done);
  if (stuck.length > 0 && !problems.some((p) => p.code === 'UNKNOWN_DEPENDENCY')) {
    problems.push({ code: 'CYCLE', detail: `These wait on each other and can never run: ${stuck.map((m) => m.ref).join(', ')}.` });
  }

  return { applied, pending, problems };
};

// Throw the plan's problems as one error, named by the first.
export const refuseProblems = (plan: Plan): void => {
  const first = plan.problems[0];
  if (first === undefined) return;
  throw new StrataError(first.code, 'The migrations cannot be applied safely.', plan.problems.map((p) => `${p.code}: ${p.detail}`));
};
