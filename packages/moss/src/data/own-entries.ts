import { createMemoryCache, createQueryEngine, handleDiscovery, handleQuery, seedCache, tablesChangedBy } from '@niscorp/vex';
import type { DatabaseAdapter, ExecuteRecord, Filter, MutationClient, QueryEngine, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import { z } from 'zod';
import type { Pointer } from '../manifest';

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
// itself, ./migrate.ts), and an entry that reads or writes any other is
// refused when it is handed over, before anything is replayed.
//
// Modelled on `executeAs` (./policy.ts): replay only, in process, the
// policy said by server code. Where that one logs a refusal and answers
// nothing, this one throws.
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

export type OwnEntriesDeps = {
  // The adapter the app's own engine reads through: a read of theirs is
  // bounded as an app's is, and the tables that are their owner's are asked
  // of the database through it.
  adapter: DatabaseAdapter;
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
  (deps: OwnEntriesDeps) =>
  async (own: OwnEntries): Promise<Replay> => {
    const cache = createMemoryCache();
    await seedCache(cache, own.entries);
    // ITS OWNER'S TABLES, READ OFF THE DATABASE FOR THIS ENGINE, AND NO OTHER
    // TABLE. The schema the app's engine read is the app's to cut down: with
    // `runtime.vexConfig.entities` set, it holds the tables of that list and
    // moss's own are not among them, so every entry here would answer
    // `Entity "…" not found in schema`. So the list an app gives vex says
    // nothing here, and neither does anything else of the app's engine. What
    // this engine knows is the tables that are its owner's, which is also all
    // it may serve.
    const schema = await deps.adapter.introspect({ entities: [...own.tables] });
    // An engine beside the app's, over the same database, through the same
    // adapter.
    const engine = createQueryEngine({
      adapter: { id: deps.adapter.id, compile: deps.adapter.compile, execute: deps.adapter.execute, capabilities: deps.adapter.capabilities, introspect: async () => schema },
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

// THE GENERATION POINTER'S ROW — read and moved through vex.
//
// `moss_generation` is a table this module owns (./tables.ts): one row, one
// counter, which every process polls to learn that another one changed what
// the app consists of (../manifest, generation.ts, which holds the clock).
//
// It is read and moved by two entries, authored like any other and replayed
// the way a feature's own entries are (`createOwnEntries`, above): seeded
// where no route serves them, under a policy that admits this one table. So a
// data grant on `moss_generation` moves nothing, and nobody's charter needs to
// name it for the server to poll.
//
// THE MOVE IS A COMPARE AND A SET, NOT AN ADDITION. Vex's write grammar sets a
// column to a value; it reads no column, so it cannot say `n = n + 1`. The
// caller reads the counter and this writes the next number WHERE THE COUNTER
// IS STILL WHAT WAS READ. Two processes moving at once cannot both land on one
// number: one of them writes no row, is told so, and reads again.

const TABLE = 'moss_generation';
// The one row there is, written by the migration that made the table.
const THE_ROW: Filter = { eq: [`${TABLE}.id`, 1] };

const read: SeedEntry = {
  fingerprint: 'moss/generation',
  intent: 'Where the generation pointer is',
  dsl: { from: [TABLE], fields: [`${TABLE}.n`], filter: THE_ROW, limit: 1 },
};

const move: SeedMutation = {
  fingerprint: 'moss/generation-move',
  intent: 'Move the generation pointer to the next number, if it is still where it was read',
  mutation: {
    op: 'update',
    table: TABLE,
    set: { n: { $context: 'next' } },
    where: { and: [THE_ROW, { eq: [`${TABLE}.n`, { $context: 'seen' }] }] },
  },
};

// The two entries, and the one table the policy they run under admits.
export const POINTER: OwnEntries = { owner: 'the generation pointer', entries: [read, move], tables: [TABLE] };

// What a replay answers. A BIGINT is handed over as a number by one driver and
// as the text of one by another.
const RowSchema = z.object({ n: z.coerce.number() });
const RowsSchema = z.array(z.unknown());

// The pointer the manifest module is handed, over a replay of the two entries.
// The replay is asked for at each use: it is made once, when it is first
// wanted, by whoever hands it over.
export const createPointer = (replay: () => Promise<Replay>): Pointer => ({
  // A pointer with no row reads as zero. One whose `n` is not a number is not
  // a reading: this throws, and whoever polls says that it could not read.
  read: async () => {
    const rows = RowsSchema.parse(await (await replay())(read.fingerprint, {}));
    return RowSchema.parse(rows[0] ?? { n: 0 }).n;
  },
  // A write that changed one row answers that row; one that changed none
  // answers no row, which is the counter having moved since it was read.
  move: async (from) => RowSchema.safeParse(await (await replay())(move.fingerprint, { seen: from, next: from + 1 })).success,
});
