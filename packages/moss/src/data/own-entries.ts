import { createMemoryCache, createQueryEngine, handleDiscovery, handleQuery, seedCache, tablesChangedBy } from '@niscorp/vex';
import type { DatabaseAdapter, DatabaseSchema, ExecuteRecord, MutationClient, QueryEngine, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// A FEATURE'S OWN ENTRIES — the reads and writes a feature makes on the tables
// it keeps, authored as data exactly as an app authors its entries, and
// replayed in process by the feature and nobody else.
//
// NO ROUTE SERVES THEM. They are seeded into a cache of their own, held by an
// engine of their own, and that engine is handed to no route: `/api/vex`
// replays what the app's cache holds, and these are not in it, whatever the
// charter grants whoever asks. What they do is guarded somewhere else (an
// approval is behind the operator key), and a data grant must not become a
// second way to it.
//
// THEY RUN UNDER A POLICY OF THEIR OWN: the tables that are their owner's,
// open, and every other table refused. It names no role and reads no scope
// value, so it holds where nobody is signed in yet (a key looked up by its
// hash). WHICH TABLES THOSE ARE IS NOT THE ASKER'S TO SAY: whoever builds this
// hands them over with the owner (a feature's are the ones it names on
// itself, ./feature-tables.ts), and an entry that reads or writes any other is
// refused when it is handed over, before anything is replayed.
//
// Modelled on `executeAs` (./execute-as.ts): replay only, in process, the
// policy said by server code. Where that one logs a refusal and answers
// nothing, this one throws: the statement it stands in for threw.
// ═══════════════════════════════════════════════════════════════

export type OwnEntries = {
  // Whose they are, as a refusal names them: `the feature "integrations"`.
  owner: string;
  // The reads and writes, as an app writes its own.
  entries: readonly (SeedEntry | SeedMutation)[];
  // The tables that are the owner's: all that the policy they run under
  // admits.
  tables: readonly string[];
};

// Replay one of them, by its fingerprint. A read answers its rows; a write the
// row it wrote, or every row when it wrote more or fewer than one. Throws when
// vex refuses it.
export type Replay = (fingerprint: string, context: Record<string, unknown>) => Promise<unknown>;

export type OwnEntriesConfig = {
  // The adapter the app's own engine reads through, and the schema that engine
  // introspected: a feature's entries see the tables the app's see, and a read
  // of theirs is bounded as an app's is.
  adapter: DatabaseAdapter;
  schema: DatabaseSchema;
  // The client a write is replayed on.
  db: MutationClient;
  // The app's engine, told which tables a write of the feature's changed: a
  // reactive read over one of them answers again, as it does after a write of
  // the app's own.
  engine: Pick<QueryEngine, 'invalidate'>;
  // Told of each execution, as the routes' own executions are.
  onExecute?: (record: ExecuteRecord) => void;
};

const resultOf = (body: unknown): unknown => (body !== null && typeof body === 'object' && 'result' in body ? body.result : undefined);

const messageOf = (body: unknown): string =>
  body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'no reason given';

export const createOwnEntries =
  (config: OwnEntriesConfig) =>
  async (own: OwnEntries): Promise<Replay> => {
    const { schema } = config;
    const cache = createMemoryCache();
    await seedCache(cache, own.entries);
    // An engine beside the app's, over the same database. It introspects
    // nothing: the tables are the ones the app's engine found.
    const engine = createQueryEngine({
      adapter: { id: config.adapter.id, compile: config.adapter.compile, execute: config.adapter.execute, capabilities: config.adapter.capabilities, introspect: async () => schema },
      cache,
    });
    await engine.introspect();
    const policy: ScopePolicy = { default: 'deny', entities: Object.fromEntries(own.tables.map((table) => [table, { public: true }])) };
    // REFUSED AT THE HAND-OVER, not at the first replay: vex's own discovery
    // lists, for a policy, the entries it can touch (a read by every table it
    // reads, a write by every table it writes). One that is not listed
    // addresses a table that is not its owner's.
    const reachable = new Set((await handleDiscovery({ engine, locked: true, scopePolicy: policy })).fingerprints.map((listed) => listed.fingerprint));
    const outside = own.entries.map((entry) => entry.fingerprint).filter((fingerprint) => !reachable.has(fingerprint));
    if (outside.length > 0) {
      throw new Error(
        `moss: ${own.owner} handed over ${outside.length === 1 ? 'an entry that reads or writes' : 'entries that read or write'} a table that is not its own: ${outside.map((fingerprint) => `"${fingerprint}"`).join(', ')}. ` +
          `Its own entries run outside the app's policy, so they reach ${own.tables.length === 0 ? 'no table, because it names none as its own' : `the tables that are its own (${own.tables.join(', ')}) and no other`}. ` +
          `What another table holds is read through the app's entries, under the charter.`,
      );
    }

    return async (fingerprint, context) => {
      const outcome = await handleQuery(
        {
          engine,
          locked: true,
          scopePolicy: policy,
          mutations: { client: config.db, policy, onWrite: (event) => config.engine.invalidate(tablesChangedBy(event.writes, schema)) },
          ...(config.onExecute !== undefined ? { onExecute: config.onExecute } : {}),
        },
        { fingerprint, context },
        {},
      );
      if (outcome.status !== 200) throw new Error(`moss: the entry "${fingerprint}" was refused (${outcome.status}): ${messageOf(outcome.body)}`);
      return resultOf(outcome.body);
    };
  };
