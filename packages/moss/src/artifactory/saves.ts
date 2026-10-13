import { StrataError } from '@niscorp/strata';
import type { Upgrader } from '@niscorp/strata';
import type { Filter, ScopeMatch, ScopeRules, ScopeSet, SeedEntry, SeedMutation } from '@niscorp/vex';
import { z } from 'zod';
import { upgradedLayoutBody } from './layouts';

export type Replay = (fingerprint: string, context: Record<string, unknown>, scope?: Record<string, unknown>) => Promise<unknown>;

export type SavedVersion = {
  save: string;
  kind: string;
  id: string;
  // In the grammar this server runs. `null`: this version says none is in force.
  body: unknown;
  // Why the body could not be brought to that grammar. It is then as it was stored.
  unread?: string;
  copiedFrom: string | null;
  createdAt: string;
};

export type NewSave = {
  id: string;
  versions: readonly Pick<SavedVersion, 'kind' | 'id' | 'body' | 'copiedFrom'>[];
};

// The rows of one caller: no call names whose they are.
export type SavedRows = {
  // The latest version of each artifact, those that say none is in force among them.
  inForce: () => Promise<SavedVersion[]>;
  history: (kind: string, id: string, save?: string) => Promise<SavedVersion[]>;
  write: (save: NewSave) => Promise<void>;
};

// A row is its caller's: vex keeps every read and every write of the two tables
// to the rows whose `principal` is the caller's `userId`. So no entry below
// names a principal, and none can reach another's rows.
const theirs: ScopeMatch = { match: 'principal', to: 'userId' };

// The match says which rows a write may touch, and not what it writes: with it
// alone, an update could write another's `userId` into a row of the caller's
// own. This writes the caller's, whatever the statement says.
const stamped: ScopeSet = { set: 'principal', to: 'userId' };

export const SAVE_ROW_RULES: Readonly<Record<string, ScopeRules>> = {
  artifacts: { read: [theirs], write: [theirs, stamped] },
  artifact_saves: { read: [theirs], write: [theirs, stamped, { set: 'created_by', to: 'userId' }] },
};

const PAGE = 500;

const VERSION_COLUMNS = ['save', 'kind', 'id', 'body', 'grammar', 'copied_from', 'created_at'];

// `held` is a version, and this is a later one of the same artifact. Two written
// in the same instant are told apart by their save, so that one of them is the latest.
const laterThanHeld: Filter = {
  and: [
    { eq: ['artifacts.kind', 'held.kind'] },
    { eq: ['artifacts.id', 'held.id'] },
    { or: [{ gt: ['artifacts.created_at', 'held.created_at'] }, { and: [{ eq: ['artifacts.created_at', 'held.created_at'] }, { gt: ['artifacts.save', 'held.save'] }] }] },
  ],
};

const afterHeld: Filter = {
  or: [{ gt: ['held.kind', { $context: 'after_kind' }] }, { and: [{ eq: ['held.kind', { $context: 'after_kind' }] }, { gt: ['held.id', { $context: 'after_id' }] }] }],
};

const inForce: SeedEntry = {
  fingerprint: 'artifactory/in-force',
  intent: 'The latest version of each of the caller’s artifacts, a page at a time',
  dsl: {
    from: [{ as: 'held', query: { from: ['artifacts'], fields: VERSION_COLUMNS.map((column) => `artifacts.${column}`) } }],
    fields: VERSION_COLUMNS.map((column) => `held.${column}`),
    filter: { and: [{ not: { exists: { from: ['artifacts'], filter: laterThanHeld } } }, afterHeld] },
    sort: [
      { field: 'held.kind', dir: 'asc' },
      { field: 'held.id', dir: 'asc' },
    ],
    limit: PAGE,
  },
};

const history: SeedEntry = {
  fingerprint: 'artifactory/history',
  intent: 'The versions of one of the caller’s artifacts, the newest first',
  dsl: {
    from: ['artifacts'],
    fields: VERSION_COLUMNS.map((column) => `artifacts.${column}`),
    filter: {
      and: [
        { eq: ['artifacts.kind', { $context: 'kind' }] },
        { eq: ['artifacts.id', { $context: 'id' }] },
        { optional: { key: 'save', then: { eq: ['artifacts.save', { $context: 'save' }] } } },
      ],
    },
    sort: [
      { field: 'artifacts.created_at', dir: 'desc' },
      { field: 'artifacts.save', dir: 'desc' },
    ],
    limit: PAGE,
  },
};

// One transaction, so the rows of a save carry one `created_at`.
const save: SeedMutation = {
  fingerprint: 'artifactory/save',
  intent: 'Keep a save of the caller’s and the versions it holds',
  mutation: [
    { op: 'insert', table: 'artifact_saves', values: { id: { $context: 'save' } } },
    {
      op: 'insertEach',
      table: 'artifacts',
      items: { $context: 'versions' },
      values: { save: { $context: 'save' }, kind: { $item: 'kind' }, id: { $item: 'id' }, body: { $item: 'body' }, grammar: { $item: 'grammar' }, copied_from: { $item: 'copied_from' } },
    },
  ],
};

export const SAVE_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [inForce, history, save];

const RowSchema = z.object({
  save: z.string(),
  kind: z.string(),
  id: z.string(),
  body: z.unknown(),
  grammar: z.record(z.string(), z.coerce.number()).catch({}),
  copied_from: z.string().nullish(),
  // Drivers hand back a Date, an ISO string or a number for the same column.
  created_at: z.union([z.date(), z.string(), z.number()]).transform((at) => new Date(at).toISOString()),
});

type Row = z.infer<typeof RowSchema>;

// What of a body is written in a grammar, by kind.
const upgradedBody: Readonly<Record<string, (upgrader: Upgrader, body: unknown, stamp: Row['grammar']) => unknown>> = { layout: upgradedLayoutBody };

const versionOf = (row: Row, upgrader: Upgrader): SavedVersion => {
  const version = { save: row.save, kind: row.kind, id: row.id, copiedFrom: row.copied_from ?? null, createdAt: row.created_at };
  const upgrade = upgradedBody[row.kind];
  if (row.body === null || row.body === undefined || upgrade === undefined) return { ...version, body: row.body ?? null };
  try {
    return { ...version, body: upgrade(upgrader, row.body, row.grammar) };
  } catch (error) {
    if (!(error instanceof StrataError)) throw error;
    return { ...version, body: row.body, unread: error.message.split('\n')[0] ?? error.code };
  }
};

// `scope`: the values of the caller the rows are read and written for, as the routes hand them to vex.
export const savedRowsOver =
  (replay: Replay, upgrader: Upgrader) =>
  (scope: Record<string, unknown>): SavedRows => {
    const versionsIn = (answered: unknown): SavedVersion[] =>
      z
        .array(RowSchema)
        .parse(answered)
        .map((row) => versionOf(row, upgrader));

    const everyVersionInForce = async (after?: SavedVersion): Promise<SavedVersion[]> => {
      const page = versionsIn(await replay(inForce.fingerprint, { after_kind: after?.kind ?? '', after_id: after?.id ?? '' }, scope));
      const last = page.at(-1);
      return page.length < PAGE || last === undefined ? page : [...page, ...(await everyVersionInForce(last))];
    };

    return {
      inForce: () => everyVersionInForce(),
      history: async (kind, id, saved) => versionsIn(await replay(history.fingerprint, { kind, id, ...(saved === undefined ? {} : { save: saved }) }, scope)),
      write: async (saved) => {
        const versions = saved.versions.map((version) => ({ kind: version.kind, id: version.id, body: version.body, grammar: upgrader.stamp, copied_from: version.copiedFrom }));
        await replay(save.fingerprint, { save: saved.id, versions }, scope);
      },
    };
  };
