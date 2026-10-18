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

// The rows of one principal: no call names whose they are.
export type SavedRows = {
  // The latest version of each artifact, those that say none is in force among them.
  inForce: () => Promise<SavedVersion[]>;
  history: (kind: string, id: string, save?: string) => Promise<SavedVersion[]>;
  write: (save: NewSave) => Promise<void>;
  // Marks these artifacts as used at `at`: every version of each, so the sweep reads one stamp.
  touch: (artifacts: readonly { kind: string; id: string }[], at: string) => Promise<void>;
};

// A row is its caller's: vex keeps every read and every write of the two tables
// to the rows whose `principal` is the caller's `userId`. So no entry below
// names a principal, and none can reach another's rows.
const theirs: ScopeMatch = { match: 'principal', to: 'userId' };

// The match says which rows a write may touch, and not what it writes: with it
// alone, an update could write another's `userId` into a row of the caller's
// own. This writes the caller's, whatever the statement says.
const stamped: ScopeSet = { set: 'principal', to: 'userId' };

// Who made a save is not always whose it is: what is published is everybody's,
// and made by whoever published it. No caller's scope carries this value
// (`callerScope`), so only moss's own entries can make a save.
const MADE_BY = 'artifactSavedBy';
const madeBy: ScopeSet = { set: 'created_by', to: MADE_BY };

export const SAVE_ROW_RULES: Readonly<Record<string, ScopeRules>> = {
  artifacts: { read: [theirs], write: [theirs, stamped] },
  artifact_saves: { read: [theirs], write: [theirs, stamped, madeBy] },
};

// What is published for everybody is the rows of this one principal, under the
// rule every principal's rows are under.
export const EVERYBODY = '*';

// A scope the server composed for a caller goes through here before vex is
// handed it. One whose `userId` is that principal would read and write what is
// published as their own, and one that says who made a save could make a save
// as anybody.
export const callerScope = (scope: Record<string, unknown>): Record<string, unknown> => {
  if (scope['userId'] === EVERYBODY) {
    throw new Error(
      `moss: a caller’s \`userId\` is "${EVERYBODY}", and that is whose the rows published for everybody are. No caller is it: the app’s sign-in or its \`scope\` answers another.`,
    );
  }
  if (Object.hasOwn(scope, MADE_BY)) {
    throw new Error(`moss: a caller’s scope carries \`${MADE_BY}\`. Who made a save is written from that value, and it is moss’s to say: the app’s \`scope\` names its own otherwise.`);
  }
  return scope;
};

export type SavedRowsOf = {
  // `scope`: the values of the caller the rows are read and written for, as the routes hand them to vex.
  of: (scope: Record<string, unknown>) => SavedRows;
  // `by`: who a save of them is made by. With none they are read, and a write is refused.
  published: (by?: string) => SavedRows;
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

// One update for each artifact: a mutation's filter names one id, and ids are unique within a kind.
const touch: SeedMutation = {
  fingerprint: 'artifactory/touch',
  intent: 'Mark one of the caller’s artifacts as used now',
  mutation: [
    {
      op: 'update',
      table: 'artifacts',
      set: { last_used_at: { $context: 'at' } },
      where: { and: [{ eq: ['artifacts.kind', { $context: 'kind' }] }, { eq: ['artifacts.id', { $context: 'id' }] }] },
    },
  ],
};

export const SAVE_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [inForce, history, save, touch];

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

type Upgraded = (upgrader: Upgrader, body: unknown, stamp: Row['grammar']) => unknown;

const upgradedAs =
  (grammarKind: string): Upgraded =>
  (upgrader, body, stamp) =>
    upgrader.upgrade(body, { kind: grammarKind, stamp }).document;

// What of a body is written in a grammar, by kind.
const upgradedBody: Readonly<Record<string, Upgraded>> = {
  layout: upgradedLayoutBody,
  action: upgradedAs('nisc.nova/action'),
  fragment: upgradedAs('nisc.nova/fragment'),
  read: upgradedAs('nisc.vex/entry'),
};

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

export const savedRowsOver = (replay: Replay, upgrader: Upgrader): SavedRowsOf => {
  const versionsIn = (answered: unknown): SavedVersion[] =>
    z
      .array(RowSchema)
      .parse(answered)
      .map((row) => versionOf(row, upgrader));

  const rows = (scope: Record<string, unknown>): SavedRows => {
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
      touch: async (artifacts, at) => {
        for (const { kind, id } of artifacts) await replay(touch.fingerprint, { kind, id, at }, scope);
      },
    };
  };

  return {
    of: (scope) => rows({ ...callerScope(scope), [MADE_BY]: scope['userId'] }),
    published: (by) => rows({ userId: EVERYBODY, ...(by === undefined ? {} : { [MADE_BY]: by }) }),
  };
};
