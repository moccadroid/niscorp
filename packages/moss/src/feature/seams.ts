import type { Hono } from 'hono';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import type { Sequence, Upgrader } from '@niscorp/strata';
import type { SeedEntry, SeedMutation, WriteEvent } from '@niscorp/vex';
import type { Telemetry } from '../runtime';

// ═══════════════════════════════════════════════════════════════
// THE SEAMS — everything of the core a feature may touch, as one object the
// server hands it when it starts.
//
// Each member is a function or one narrow value, and each belongs to the
// module that answers that question: who is calling (identity), what exists
// for them (manifest), what they may read and write (data), what they are
// looking at (shells), and the server's own routes. The server assembles them
// from what those modules offer; no member is the manifest, the runtime or a
// module's whole answer. A feature that needs something that is not here does
// not reach for it: the seam is added to its owner first, on its own.
//
// TWENTY-ONE MEMBERS, AND EACH IS ONE A FEATURE USES (counted 2026-10-11
// against the two features there are: twenty by ../integrations, `onWrite` by
// ../tide, and none is unused). A member that stops being used is taken out;
// one is not added for a feature that might want it.
//
// The types are written out here rather than imported from their owners,
// because the manifest names a feature (`NiscApp.features`) and so this module
// sits beneath it. The server holds each member to its owner's type where it
// assembles them.
// ═══════════════════════════════════════════════════════════════

// What a route a feature mounts can read off the request it serves: who is
// calling, as the server's authentication resolved it. `null` is nobody signed
// in.
export type FeatureEnv = { Variables: { principal: string | null } };

// Who a principal is, as far as a feature may know: the roles they wear, and
// the integrations live for their tenant (`undefined`: the app keeps no list,
// and every one is live).
export type Whoever = { roles: readonly string[]; installed: readonly string[] | undefined };

// What a credential of the feature's own says about a token: the principal it
// stands for, or what to answer instead. A principal is resolved by the server
// like any other, and nothing after that can tell the two apart.
export type CredentialAnswer = { principal: string } | { refused: { status: 401 | 403; error: string; message: string } };

type Actions = Readonly<Record<string, ActionDefinition>>;

// How a feature replays one of its own entries, by its fingerprint: a read
// answers its rows, a write the row it wrote (every row, when it wrote more
// or fewer than one). Throws when the entry is refused.
export type Replay = (fingerprint: string, context: Record<string, unknown>) => Promise<unknown>;

export type FeatureSeams = {
  // ── the server ──
  // Mount routes at the server's root, after its own, behind the
  // authentication every route gets.
  routes: (routes: Hono<FeatureEnv>) => void;
  // Mount routes under `/operator`, behind the operator key and the app's own
  // gate.
  operatorRoutes: (routes: Hono<FeatureEnv>) => void;
  // A bearer token that starts with `prefix` is this feature's to read. It is
  // handed the token and the request it came on, and says who that is.
  credential: (prefix: string, principalOf: (token: string, request: Request) => Promise<CredentialAnswer>) => void;

  // ── who is calling ──
  // Who a principal is: the roles they wear, and the integrations live for
  // them. `null` is nobody signed in.
  who: (principal: string | null) => Promise<Whoever>;
  // The scope values a principal carries: the ones the engine pins rows by.
  scopeOf: (principal: string) => Promise<Record<string, unknown>>;

  // ── what exists for them ──
  // The action ids a set of roles holds of the actions in force, for an
  // install list.
  holds: (roles: readonly string[], installed: readonly string[] | undefined) => readonly string[];
  // The actions in force: what the app shipped, then each set handed over.
  actions: () => Actions;
  // Put a set of actions in place of the one of that name, in this process.
  // Throws, and changes nothing, when the app could not be served that way.
  replaceActions: (source: string, actions: Record<string, ActionDefinition>) => void;
  // Could the app be served with exactly these actions in force? The sentence
  // it would be refused with, or `undefined`. Nothing is switched.
  refusalOf: (actions: Actions) => string | undefined;
  // How a set that lives in rows is read again when another process says that
  // something changed. It is what carries a set to the other processes of a
  // deployment: a set with no loader stays in the process it was handed to.
  loadActionsFrom: (source: string, load: () => Promise<Record<string, ActionDefinition>>) => void;
  // One more rule for which granted actions are there for an install list.
  narrowCatalogs: (filter: (ids: readonly string[], installed: ReadonlySet<string> | undefined) => readonly string[]) => void;
  // The charter the app shipped: role names, and what each selects.
  charter: Charter;
  // The kit's component contracts, by name: a description, and the schema of
  // the props, where the app carried them.
  components: Readonly<Record<string, { meta?: { description?: string; propsSchema?: unknown } }>>;

  // ── what they may read and write ──
  // THE FEATURE'S OWN READS AND WRITES, on the tables it keeps: entries
  // authored as an app authors its own. Answers how one is replayed, in
  // process. No route serves them, whatever the charter grants whoever asks,
  // and they run under a policy that admits the tables this feature named as
  // its own (`Feature.tables.names`) and no other. Which tables is not said
  // here: an entry that reads or writes any other table is refused when it is
  // handed over.
  ownEntries: (entries: readonly (SeedEntry | SeedMutation)[]) => Promise<Replay>;
  // Reads a stored document in this code's grammars, and stamps one it writes.
  grammars: Upgrader;
  // Every fingerprint the app serves.
  fingerprints: () => Promise<readonly string[]>;
  // The fingerprints somebody may be told of: the reads and writes their own
  // policy lets them replay, sorted. Nobody signed in is asked as `null`.
  fingerprintsFor: (principal: string | null) => Promise<readonly string[]>;
  // HEAR EVERY WRITE THE ROUTES SERVE, once it is committed: what vex reports
  // of it (the statements that ran, the rows the database returned, the scope
  // the request could not forge), and the place in a chain of effects the
  // request that wrote said it was at, when it said one. That place is the
  // caller's word and nothing more: whoever hears it decides whether to
  // believe it. Told after the commit, and on its own: a listener that throws
  // is logged, and neither the write nor the next listener is touched.
  // Returns the way to stop hearing.
  onWrite: (listener: (event: WriteEvent, chain: { cause: string; depth: number } | undefined) => void) => () => void;

  // ── what the deployment supplies ──
  // Where a span goes. Absent: none is built.
  telemetry: Telemetry | undefined;
  // The seed the deployment signs with (`runtime.signingSeed`). Absent: a key
  // made at boot and kept nowhere.
  signingSeed: string | undefined;

  // ── what they are looking at ──
  // Lay a function around the wire a session's screens call through.
  wrapWire: (wrap: (inner: FetchFn) => FetchFn) => void;
};

// A FEATURE: something an app adds to moss that owns none of its five
// questions. The app puts it in `features`; the server starts each one, in
// order, once the core stands and before anything is served. `start` mounts,
// registers and loads through the seams and nothing else. One that throws
// refuses the boot.
export type Feature = {
  // What it is called. Its tables are kept under this name, and a refusal
  // says it: no two features of an app share one.
  name: string;
  // THE TABLES IT KEEPS. Said here and not through a seam, for two reasons.
  // Tables exist before anything starts. And which tables a feature reads and
  // writes outside the app's policy has to be readable off the feature by
  // whoever puts it in a manifest, without running it.
  tables?: {
    // THE TABLES THAT ARE ITS OWN, by name: every table its own entries read
    // and write (the `ownEntries` seam), and all they may. A table has one
    // owner: a feature that names one of the core's (sessions, the generation
    // pointer, the vex cache, the migration ledger), or one another feature
    // names, refuses the boot with a sentence that says which and why.
    names: readonly string[];
    // The strata sequences of its own that make them. They go through the one
    // ledgered run every owner's tables go through, after moss's and before
    // the app's, so the tables are there when `start` is called. They are
    // tables like any other from then on: the charter's `data` universe holds
    // them, and the step that migrates before a deployment starts runs them.
    sequences?: readonly Sequence[];
  };
  start: (seams: FeatureSeams) => void | Promise<void>;
};
