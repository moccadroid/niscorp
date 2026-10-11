import type { Hono } from 'hono';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import type { Sequence, Upgrader } from '@niscorp/strata';
import type { DocumentStore } from '@niscorp/strata/postgres';
import type { SeedEntry, SeedMutation, WriteEvent } from '@niscorp/vex';
import type { Telemetry } from '../runtime';

// ═══════════════════════════════════════════════════════════════
// THE SEAMS — everything of the core a feature may touch, as one object the
// server hands it when it starts.
//
// MADE FOR THE FEATURE IT IS HANDED TO. `Feature` and this type are public,
// so anybody can write a feature, and what one is handed decides what it can
// do. So the members that reach something owned are bound to their feature:
// its own entries reach the tables it named on itself, its set of actions is
// the one under its name, the store it has upgraded is in a table of its own.
// None of them takes the name of a table or of a set, and no member carries a
// secret of the deployment's or of another feature's.
//
// Each member is a function or one narrow value, and each belongs to the
// module that answers that question: who is calling (identity), what exists
// for them (manifest), what they may read and write (data), what they are
// looking at (shells), and the server's own routes. The server assembles them
// from what those modules offer; no member is the manifest, the runtime or a
// module's whole answer. A feature that needs something that is not here does
// not reach for it: the seam is added to its owner first, on its own.
//
// TWENTY-THREE MEMBERS, AND EACH IS ONE A FEATURE USES (counted 2026-10-11
// against the two features there are: twenty-two by ../integrations, `onWrite`
// by ../tide, and none is unused). A member that stops being used is taken
// out; one is not added for a feature that might want it.
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
export type PrincipalIdentity = { roles: readonly string[]; installed: readonly string[] | undefined };

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
  mountRoutes: (routes: Hono<FeatureEnv>) => void;
  // Mount routes under `/operator`, behind the operator key and the app's own
  // gate.
  mountOperatorRoutes: (routes: Hono<FeatureEnv>) => void;
  // A bearer token that starts with `prefix` is this feature's to read. It is
  // handed the token and the request it came on, and says who that is.
  registerCredential: (prefix: string, principalOf: (token: string, request: Request) => Promise<CredentialAnswer>) => void;

  // ── who is calling ──
  // Who a principal is: the roles they wear, and the integrations live for
  // them. `null` is nobody signed in.
  resolveIdentity: (principal: string | null) => Promise<PrincipalIdentity>;
  // The scope values a principal carries: the ones the engine pins rows by.
  scopeOf: (principal: string) => Promise<Record<string, unknown>>;

  // ── what exists for them ──
  // The action ids a set of roles holds of the actions in force, for an
  // install list.
  grantedActionIds: (roles: readonly string[], installed: readonly string[] | undefined) => readonly string[];
  // The actions in force: what the app shipped, then each set handed over.
  actions: () => Actions;
  // THIS FEATURE'S OWN SET OF ACTIONS, put in place of the one it handed over
  // before, in this process. Throws, and changes nothing, when the app could
  // not be served that way. A feature has one set, kept under its name, and
  // this is the one way it is written: the app cannot hand a set over under a
  // feature's name (`server.replaceActions` refuses it), and no other feature
  // reaches it.
  replaceActions: (actions: Record<string, ActionDefinition>) => void;
  // Could the app be served with exactly these actions in force? The sentence
  // it would be refused with, or `undefined`. Nothing is switched.
  refusalOf: (actions: Actions) => string | undefined;
  // THAT SET LIVES IN ROWS: how it is read again when another process says
  // that something changed. It is what carries the set to the other processes
  // of a deployment: with no loader it stays in the process it was handed to.
  setActionsLoader: (load: () => Promise<Record<string, ActionDefinition>>) => void;
  // One more rule for which granted actions are there for an install list. A
  // filter narrows: of what it answers, the ids it was handed are kept, and
  // one it was not handed is dropped. It grants nothing; the charter does.
  addCatalogFilter: (filter: (ids: readonly string[], installed: ReadonlySet<string> | undefined) => readonly string[]) => void;
  // The charter the app shipped: role names, and what each selects.
  charter: Charter;
  // The kit's component contracts, by name: a description, and the schema of
  // the props, where the app carried them.
  components: Readonly<Record<string, { meta?: { description?: string; propsSchema?: unknown } }>>;
  // DOES A LAYOUT COMPOSE WHAT THE APP'S KIT HAS? Each place it does not, as a
  // sentence, once: a component the app has none for, a prop the component has
  // no place for, a value its schema refuses (a value that resolves when it
  // is drawn has its key held and is not read). Empty: it fits. For a layout
  // somebody else wrote, asked before it is let in: a component the terminal
  // cannot draw shows nothing, and at the moment somebody opens the screen.
  layoutMisfits: (layout: unknown) => string[];
  // THE CHAINS OF STEPS THAT NEVER END among a set of actions: a trigger that
  // emits the channel it listens on, a mount that loads itself, and every
  // longer loop through other actions. Each as the one line that names it,
  // with the ids of the actions its steps run through, so that whoever asks
  // about actions somebody else wrote, laid over the app's (`actions()`),
  // keeps the chains that run through those. Nova stops such a chain at its
  // budget when it runs; this is how one is refused before it does.
  endlessChains: (actions: Actions) => { path: string; through: readonly string[] }[];

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
  // BRING THE DOCUMENTS STORED IN ONE OF ITS OWN TABLES TO THIS CODE'S
  // GRAMMARS: every row that is behind is rewritten and stamped current, in
  // one transaction, and a row written by newer code throws (strata's
  // `TOO_NEW`). For a feature that keeps documents in rows, asked while it
  // starts, so that reading one upgrades nothing in the common case. A store
  // in a table that is not this feature's own is refused.
  upgradeStore: (store: DocumentStore) => Promise<void>;
  // Every fingerprint the app serves.
  fingerprints: () => Promise<readonly string[]>;
  // The fingerprints somebody may be told of: the reads and writes their own
  // policy lets them replay, sorted. Nobody signed in is asked as `null`.
  fingerprintsFor: (principal: string | null) => Promise<readonly string[]>;
  // HEAR EVERY WRITE THE ROUTES SERVE, once it is committed: what vex reports
  // of it (the statements that ran, the rows the database returned, the scope
  // the request could not forge), and what the request that wrote said in its
  // headers, asked by name (`request.header('x-…')`). The core reads none of
  // them: a header a feature's callers send is that feature's to name and to
  // check. What a header says is the caller's word and nothing more: whoever
  // asks decides whether to believe it. The credential the request carried is
  // not answered (`Authorization`, `Cookie`): who wrote is the event's scope.
  // Told after the commit, and on its own: a listener that throws is logged,
  // and neither the write nor the next listener is touched. Returns the way
  // to stop hearing.
  onWrite: (listener: (event: WriteEvent, request: { header: (name: string) => string | undefined }) => void) => () => void;

  // ── what the deployment supplies ──
  // Where a span goes. Absent: none is built.
  telemetry: Telemetry | undefined;

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
