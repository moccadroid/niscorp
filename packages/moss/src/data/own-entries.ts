import { createMemoryCache, createQueryEngine, handleDiscovery, handleQuery, seedCache, tablesChangedBy } from '@niscorp/vex';
import type { DatabaseAdapter, ExecuteRecord, Filter, MutationClient, QueryEngine, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import { z } from 'zod';

export type OwnEntries = {
  owner: string;
  entries: readonly (SeedEntry | SeedMutation)[];
  tables: readonly string[];
};

export type Replay = (fingerprint: string, context: Record<string, unknown>) => Promise<unknown>;

export type OwnEntriesDeps = {
  adapter: DatabaseAdapter;
  db: MutationClient;
  engine: Pick<QueryEngine, 'invalidate'>;
  onExecute?: (record: ExecuteRecord) => void;
};

const resultOf = (body: unknown): unknown => (body !== null && typeof body === 'object' && 'result' in body ? body.result : undefined);

const messageOf = (body: unknown): string =>
  body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'no reason given';

export const createOwnEntries =
  (deps: OwnEntriesDeps) =>
  async (own: OwnEntries): Promise<Replay> => {
    const cache = createMemoryCache();
    await seedCache(cache, own.entries);
    // Introspected for the owner's tables, not taken from the app's engine: an
    // app may cut that engine's schema down (`vexConfig.entities`) to a list
    // these tables are not in.
    const schema = await deps.adapter.introspect({ entities: [...own.tables] });
    const engine = createQueryEngine({
      adapter: { id: deps.adapter.id, compile: deps.adapter.compile, execute: deps.adapter.execute, capabilities: deps.adapter.capabilities, introspect: async () => schema },
      cache,
    });
    await engine.introspect();
    const policy: ScopePolicy = { default: 'deny', entities: Object.fromEntries(own.tables.map((table) => [table, { public: true }])) };
    // Vex's discovery lists the entries a policy can touch, so one it leaves
    // out reads or writes a table that is not the owner's.
    const reachable = new Set((await handleDiscovery({ engine, locked: true, scopePolicy: policy })).fingerprints.map((listed) => listed.fingerprint));
    const outside = own.entries.map((entry) => entry.fingerprint).filter((fingerprint) => !reachable.has(fingerprint));
    if (outside.length > 0) {
      throw new Error(
        `moss: ${own.owner} handed over ${outside.length === 1 ? 'an entry that reads or writes' : 'entries that read or write'} a table that is not its own: ` +
          `${outside.map((fingerprint) => `"${fingerprint}"`).join(', ')}. ` +
          "Its own entries run outside the app's policy, so they reach " +
          `${own.tables.length === 0 ? 'no table, because it names none as its own' : `the tables that are its own (${own.tables.join(', ')}) and no other`}. ` +
          `What another table holds is read through the app's entries, under the charter.`,
      );
    }

    return async (fingerprint, context) => {
      const outcome = await handleQuery(
        {
          engine,
          locked: true,
          scopePolicy: policy,
          mutations: { client: deps.db, policy, onWrite: (event) => deps.engine.invalidate(tablesChangedBy(event.writes, schema)) },
          ...(deps.onExecute !== undefined ? { onExecute: deps.onExecute } : {}),
        },
        { fingerprint, context },
        {},
      );
      if (outcome.status !== 200) throw new Error(`moss: the entry "${fingerprint}" was refused (${outcome.status}): ${messageOf(outcome.body)}`);
      return resultOf(outcome.body);
    };
  };

const TABLE = 'moss_generation';
const THE_ROW: Filter = { eq: [`${TABLE}.id`, 1] };

const readPointerEntry: SeedEntry = {
  fingerprint: 'moss/generation',
  intent: 'Where the generation pointer is',
  dsl: { from: [TABLE], fields: [`${TABLE}.n`], filter: THE_ROW, limit: 1 },
};

// A compare-and-set, because vex's write grammar cannot say `n = n + 1`: of
// two processes moving at once, one writes no row and reads again.
const movePointerEntry: SeedMutation = {
  fingerprint: 'moss/generation-move',
  intent: 'Move the generation pointer to the next number, if it is still where it was read',
  mutation: {
    op: 'update',
    table: TABLE,
    set: { n: { $context: 'next' } },
    where: { and: [THE_ROW, { eq: [`${TABLE}.n`, { $context: 'seen' }] }] },
  },
};

export const POINTER: OwnEntries = { owner: 'the generation pointer', entries: [readPointerEntry, movePointerEntry], tables: [TABLE] };

const RowSchema = z.object({ n: z.coerce.number() });
const RowsSchema = z.array(z.unknown());

export type Pointer = {
  read: () => Promise<number>;
  move: (from: number) => Promise<boolean>;
};

export const createPointer = (replay: () => Promise<Replay>): Pointer => ({
  read: async () => {
    const rows = RowsSchema.parse(await (await replay())(readPointerEntry.fingerprint, {}));
    return RowSchema.parse(rows[0] ?? { n: 0 }).n;
  },
  // A write that changed one row answers that row; one that changed none
  // answers no row, which does not parse: the counter moved since it was read.
  move: async (from) => RowSchema.safeParse(await (await replay())(movePointerEntry.fingerprint, { seen: from, next: from + 1 })).success,
});
