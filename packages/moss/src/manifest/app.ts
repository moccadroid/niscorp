import type { Sequence } from '@niscorp/strata';
import type { GenerateDsl, MapToShape, QueryResponse, ScopeBehaviors, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, ActionFragment, CanvasConfig, FetchFn, FunctionHandler, LayoutNode, Shell } from '@niscorp/nova';
import type { PhraseKeys, Phrasebook } from '@niscorp/nova/i18n';
import type { Feature } from '../feature';
import type { IdentityRecord } from '../identity';

// ═══════════════════════════════════════════════════════════════
// The application, as data. Every field is an ARTIFACT — content someone
// authored — never machinery: the server derives everything mechanical
// from these plus a database (DESIGN.md § Derivation over
// configuration). `assignments` stands in for the artifact library's
// assignment table. The code an app supplies is the seams
// (functions it fills in) and `features`.
// ═══════════════════════════════════════════════════════════════

// Ring 2, as data: a layout VARIANT reshapes ONE action's layout for the
// principals whose charter grants the variant id (the `layouts` section).
// The reference direction is variant → action — an action never lists its
// variants, so minting one is additive. Holding no variant of an action
// means the base (the layout on the definition); holding two is incoherence
// the server refuses at boot. A variant changes ONLY the layout — different
// behavior (triggers, endpoints, data, input) is a different action id.
//
// Direction: the base is the FLOOR — the least-privileged holder's shape.
// Variants ENRICH upward and are granted like any other capability, so
// `extends` composes them correctly and a forgotten grant fails closed
// (under-serves visibly). A variant that reduces is authored backwards: it
// forces deny-it-back in every richer role, and a forgotten deny
// over-serves silently.
export type LayoutVariant = { action: string; layout: LayoutNode };

export type NiscApp = {
  charter: Charter;
  // THE ASSIGNMENT MAP — one entry per principal. An eager `Record` cannot be
  // filled without enumerating everybody, so an app that declares `identity`
  // answers this per principal, one row at a time, and never builds the map.
  // This field is for apps whose assignments are AUTHORED — a handful of static
  // rungs in a demo — where a literal is the honest shape.
  assignments?: Record<string, readonly string[]>;
  // WHICH ROLE COMBINATIONS A PRINCIPAL MAY HOLD — declared, not counted.
  //
  // The two coherence gates (`verifyCharter`'s subtractive-assigned rule,
  // `verifyVariants`' one-variant-per-action rule) need the distinct
  // COMBINATIONS somebody could wear, not the principals. The charter cannot
  // supply them: it defines roles, and which of them coincide on one person is a
  // fact about the application's schema (staff row AND membership row), not
  // about the grant graph.
  //
  // Absent = derived from `assignments`, which is correct while that map is eager.
  wearable?: readonly (readonly string[])[];
  actions: Record<string, ActionDefinition>;
  // layout variants by variant id — the `layouts` universe the charter
  // selects over (ring 2; `actions` is ring 1, `data` is ring 3)
  layouts?: Record<string, LayoutVariant>;
  behaviors?: ScopeBehaviors;
  // Per-principal SCOPE VALUES — the seam that lets an app decide what a
  // principal IS beyond its id. The server always injects `{ userId }` (the
  // principal); this hook contributes the rest — a tenant, an org, a region —
  // and the merged set is what a behavior's `to:` resolves against at execute
  // (`{ match: 'property_id', to: 'propertyId' }` needs `propertyId` here).
  //
  // Moss deliberately does NOT assume how a principal maps to those values: the
  // mapping is application knowledge (a directory, a claims table, a lookup),
  // so the app supplies it. Values are injected server-side and are
  // unreferenceable by a request — the enforcement is engine-side and unforgeable.
  //
  // VOLATILE VALUES ONLY. A resolved identity is held for a session; anything
  // derived from the CLOCK must not be, or a session opened before midnight
  // serves yesterday's date to every query that compares a DATE column against
  // it. So this seam is asked per request, and it stays synchronous on purpose:
  // the values that belong here are COMPUTED rather than read.
  //
  // The resolved record is handed in so the computation has what it needs
  // without a lookup: the day is derived from the timezone the record already
  // carries. Merged OVER the record's own scope values.
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  // WHO A PRINCIPAL IS, resolved ONCE per session instead of asked in pieces
  // per request — one async answer for roles, scope and the install list
  // (`installed`: which integrations are live for this principal's tenant).
  //
  // `assignments` and `scope` are synchronous: a hook that cannot await has one
  // implementation when the answer lives in rows, a resident map of the whole
  // population. This seam is async, so the answer is a row read.
  //
  // Moss OWNS the resulting cache: bounded, evicted, revalidated on
  // `sessionRevalidateMs`, and enumerable only by an operator (see identity/cache.ts,
  // and the invariants in docs/plans/lyra-identity.md Part 6). What it will
  // never do is look inside the record. `roles` goes to charter, `installed` is
  // filtered against, `scope` is merged into the engine's scope values — all
  // pass-through. The moment moss reads `.studioId` off one of these, moss has
  // learned what a tenant is and the boundary is gone.
  //
  // Absent = `assignments` answers roles and `scope` answers scope values.
  //
  // `resolve` is the pre-authorisation half: roles, the invalidation tag, and
  // whatever scope the app can only establish before a policy exists (an
  // integration actor's studio; a person's tenant). `scope` and `installed`
  // name SEEDED entries moss then executes through its own engine — under the
  // policy of the charter role `as` names, with the scope values resolved so
  // far — merging each mapped object into the record. The app's model of a
  // session thereby lives in its ARTIFACTS: the entries and their reach
  // profiles, checkable like any other, with moss holding no opinion about
  // what any of it means.
  identity?: {
    // The charter role the lent reader executes AS — a role nobody wears,
    // holding exactly the verbs identity's engine reads need. Opaque here.
    as?: string;
    // ONE seam. `read` is a capability moss lends for the duration of the
    // call: it executes a SEEDED entry through moss's own engine, locked to
    // replay, under the `as` role's compiled policy, with exactly the scope
    // values the app passes — values the app itself resolved, engine-side.
    // The app composes its whole record from its one licensed pre-auth read
    // plus these; moss caches the result and never looks inside it.
    resolve: (principal: string, read: (fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>) => Promise<IdentityRecord>;
  };
  // THE WORDS THIS PRINCIPAL'S SHELL WEARS — the language twin of `scope`.
  //
  // Moss renders a shell server-side and serializes its trees. Between those
  // two, every word the reader will see is present at once, so that is where a
  // language is applied: one pass over the frame (`@niscorp/nova/i18n`), source
  // phrase in, translated phrase out. Nothing downstream — the socket, the
  // delta encoder, the terminal — learns that a language exists.
  //
  // Returning undefined or an empty book is the SOURCE language, and costs
  // nothing: the pass returns the same tree object and the frame serializes
  // unchanged.
  //
  // Per PRINCIPAL, because a shell is per principal. Two people at the same
  // tenant reading different languages get two shells.
  // Resolved once when the shell is built — a change to a principal's language
  // is a `reset`/rebuild, exactly like a change to their catalog.
  // Async and wire-bearing, for the same reason `seeds` and `inputs` are: a
  // book lives in rows, and a hook that cannot reach them holds a resident
  // copy of every language. The resolved identity rides along so the app can
  // pick the language off the record the session already established.
  phrases?: (session: { principal: string | null; identity: Record<string, unknown>; wire: FetchFn }) => Phrasebook | undefined | Promise<Phrasebook | undefined>;
  // Which keys in a tree carry prose. An app with its own display-field
  // convention (`status_display`) declares it once here. Absent = nova's
  // default prop set and no suffix rule.
  phraseKeys?: PhraseKeys;
  // WHAT THE APP ADDS TO MOSS THAT IS NOT ONE OF ITS FIVE QUESTIONS (../feature):
  // integrations, say — `createIntegrations(...)` from
  // `@niscorp/moss/integrations`. Each is an object the app creates and
  // configures; the server starts them in this order once its core stands, and
  // each reaches the core only through the seams it is handed. What a feature
  // lets the app call afterwards, the app calls on the object it created.
  // Absent: none. The core serves an app without any.
  features?: readonly Feature[];
  // the prewarmed API surface — every read and write the app serves, as
  // authored entries; seeded into the cache at boot (idempotent, protected).
  // Optional because a database may already carry its vex_cache rows.
  entries?: readonly (SeedEntry | SeedMutation)[];
  // resource name → the entity subgraph it exposes as /api/<name>/vex
  // (a bare list, or an object carrying one — an app's resource artifacts
  // pass through unmapped). The bare /api/vex (full schema) always exists.
  resources?: Record<string, readonly string[] | { entities: readonly string[] }>;
  // The shell, as data (DESIGN.md § The shell runs on the server):
  // canvases and fragments are artifacts; `inputs` is the app's ONE
  // derivation hook — per-principal boot input (nav flags, user chips),
  // merged over each canvas's static seed. Absent = no server shells.
  shell?: ShellManifest;
  // PAGES — what is drawn at a path and kept by nothing.
  //
  // `shell` above is THE APP: one durable shell per person, the thing that
  // rearranges itself around whoever holds it. A page is the other kind of
  // thing a path can lead to — a welcome, the docs, a published talk: a small
  // manifest of its own (a frame, canvases, what mounts on them), drawn for
  // whoever asks and then let go. Nothing stands behind it afterwards unless
  // what mounted can still do something (../shells, liveness.ts), in which case the
  // terminal gets a shell for as long as its connection lasts.
  //
  // It is the SAME machinery with the keeping taken out: the same actions, the
  // same charter deciding what exists for whom (a member's chip is an action a
  // member is granted), the same policy on every read. A page drawn for nobody
  // is the same for everybody, so it may be cached or written to a file; a page
  // drawn for somebody is theirs and is not. That is decided by who asked,
  // never by the page.
  //
  // `functions` are endpoints and serve a page's actions as they serve the
  // app's. `onSession` does not run for a page: session code is the app's.
  pages?: Record<string, PageManifest>;
  // The app's own GRAMMAR sequences (strata): migrations for documents only this
  // app defines the shape of — its component kit's props, say, rewritten on
  // every nova layout node that uses them. Pure data like every artifact here: a
  // document migration is a Prism config. moss runs them with nova's and
  // Prism's over every stored document and every submitted bundle.
  grammars?: readonly Sequence[];
  // The `fn:` escape hatch, server-side: app code running IN-PROCESS next
  // to the session's durable shell (Ray lives here). Built once per
  // session — handlers close over the session context, so keys and code
  // never reach a browser. Side-effect-free computation deploys as server
  // functions behind plain `url:` endpoints instead.
  functions?: (session: FunctionSession) => Record<string, FunctionHandler>;
  // Called once per living shell, with the same session, for app code that is
  // NOT an endpoint: a per-session observer, a roster, an agent watching the
  // screen. Without it such code has to ride `functions` and be registered as a
  // handler nothing calls, which is a lie about what it is.
  //
  // It runs BEFORE the shell finishes building, like `functions` — so it must
  // defer anything that touches `session.shell`. Anything it returns is
  // ignored; to release resources, subscribe to the shell and drop on dispose.
  onSession?: (session: FunctionSession) => void;
  // Where model runs go. moss produces nothing itself — an app that runs an
  // agent calls `session.recordRun` and this receives the record with the
  // session's own fields already stamped.
  //
  // No default sink. A bounded in-memory array would answer "the last few
  // minutes, gone on restart", which is not a question anyone asks about an
  // agent's behaviour; an app that wants that can write five lines. Unset means
  // unrecorded, which is at least honest.
  runs?: RunSink;
  // A WRITE LANDED, and the app declared its interest in advance. Each
  // reaction names the table (and optionally the op) it cares about; moss
  // routes vex's write observer to the reactions whose interest matches,
  // once per matching statement — so app code never hears about writes it
  // did not declare, and never string-matches fingerprints to find out what
  // happened. `deliver` publishes onto a principal's live durable shell over
  // the socket the shells already run — push built on the transport this
  // server owns, never a second one.
  //
  // Deliberately row-less: a reaction hears THAT a write landed (table, op,
  // how many rows, the unforgeable scope), never what it wrote. A receiver
  // that wants the data re-reads it under its own policy — rows handed to
  // imperative code would be rows outside every fence this stack builds.
  // Zero-row statements (a scope-narrowed update, a conflict-skipped
  // insert) fire no reaction: nothing changed, so there is no news.
  reactions?: readonly {
    table: string;
    op?: 'insert' | 'update' | 'delete';
    run: (
      event: { fingerprint: string; table: string; op: 'insert' | 'update' | 'delete'; count: number; scope: Record<string, unknown> },
      tools: { deliver: (principal: string, channel: string, payload?: unknown) => boolean },
    ) => void;
  }[];
  // A write minted into tide as a fact is a feature: `createTideFacts` from
  // `@niscorp/moss/tide`, named in `features`. The rows of a write travel there
  // and nowhere else.
};

// One turn of an exchange with a model, in order. Provider-blind and
// library-blind on purpose: moss depends on neither an LLM client nor an agent
// framework, so this is the shape any of them can be flattened into rather than
// one client's message union leaking into the app server.
//
// A tool call and its result are two turns, the way the model saw them: the
// assistant turn that ASKED (`calls`), then the tool turn that ANSWERED (`name`
// + content). Nothing is aggregated into a separate call list — that is a
// display's business, and a second copy of the same facts drifts.
export type RunTurn = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  // What the model asked for on this turn. `args` stays a string: providers send
  // arguments JSON-encoded, and re-encoding a parse is how a malformed call
  // stops looking malformed in the record.
  calls?: ReadonlyArray<{ name: string; args: string }>;
  // Which tool a 'tool' turn is the answer from.
  name?: string;
};

// One model run, as a row. Everything is a dimension and nothing is aggregated:
// per person, per model, per session and per day are all group-bys over this,
// and a tally computed on write is wrong the moment a different cut is wanted.
//
// Deliberately not here: cost in currency. Per-model price tables rot, tokens
// are the honest unit, and `provider` + `model` let pricing be layered on later
// without a migration.
export type RunRecord = {
  at: number;
  principal: string | null;
  shellId: string;
  // The agent's own id, and its lineage when one agent runs inside another.
  agentId: string;
  agentPath: readonly string[];
  // The app's own axis — which way in produced this run.
  label: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  // False when any step was counted rather than reported by the provider.
  // Streamed responses are not reliable about the usage frame.
  reported: boolean;
  steps: number;
  elapsedMs: number;
  // THE WHOLE EXCHANGE, turn by turn: what went out (instructions, catalogs,
  // history, the input), every tool the model called and what came back from it,
  // and the answer. This is the only honest account of "why did it do that", and
  // reconstructing it after the fact is impossible — the prompt is assembled
  // from live state that has since moved.
  //
  // It is also the largest thing here by far, and it carries whatever the
  // person's screen carried. A sink that persists it is storing that.
  turns?: readonly RunTurn[];
  response?: string;
  // A failed run spent tokens too. Recording only successes undercounts
  // precisely when something is going wrong.
  outcome: 'ok' | 'failed';
};

// The session is handed along so a sink can persist through the CALLER's own
// governed wire rather than a privileged one — the row then lands under the same
// scope as everything else and cannot be written on another principal's behalf.
// A sink that wants a plain in-process array can ignore it.
export type RunSink = (record: RunRecord, session: FunctionSession) => void;

// IT SAYS WHO IS CALLING AND HOLDS NO KEY: no database pool, no operator key,
// and no policy object that reaches every person's rows. What an app needs
// instead has a call of its own:
//
//   a read or a write as the caller      `wire` (the routes, enforced)
//   a query written for an intent        `answerIntent` below
//   what the caller's roles may read     `server.policyForRoles(session.roles)`,
//                                        a copy that is the asker's own
//   the app's own database               the runtime the app created, closed
//                                        over where the app builds its manifest
export type FunctionSession = {
  // The session's nova shell. The members that change what a shell is made of
  // (`registerAction`, `setLayout`, `addCanvas` and their kin) throw on it:
  // the whole shell is `unverifiedShell(session)` from `@niscorp/moss/unverified`.
  shell: Shell;
  principal: string | null;
  roles: readonly string[];
  // The scope half of the resolved identity — the record the session was built
  // from, handed back so a function reads "which studio am I" off what the
  // engine already established instead of looking anybody up.
  identity: Record<string, unknown>;
  // The session's granted action ids, installs already filtered — the same
  // catalog the shell was built from, so a function and a screen cannot
  // disagree about what this person holds.
  actions: readonly string[];
  wire: FetchFn;
  // Session lifecycle, as capabilities — no reserved channels, no
  // observers. A login fn GRANTS: the token goes down every connection of
  // this session as a `session` message and the terminals reconnect
  // authenticated. A sign-out fn REVOKES: under moss's own credential every
  // session the principal holds is deleted, every connection closes
  // SIGNED_OUT and the durable shell dies. The promise settles when the
  // credential is gone — await it to know; ignoring it is still safe.
  grant: (token: string) => void;
  revoke: () => Promise<void>;
  // AN INTENT ANSWERED BY A QUERY WRITTEN FOR IT, as this session's principal.
  //
  // The routes replay what is stored and write nothing. An app that lets a
  // model write a query hands over its two writers (vex's `generateDsl` and
  // `mapToShape`) and asks here: the query is written, compiled and run under
  // the policy and the scope values the routes serve this principal under,
  // resolved when it is asked. The writer is shown only the tables they may
  // read, and a query that reaches past their policy is refused. What was
  // written is kept where the routes replay from: `meta.cache.fingerprint` of
  // the answer is how it is replayed afterwards, over `wire`, by whoever the
  // policy lets.
  //
  // Moss keeps one engine for each `writers` object, so hand over the same
  // object each time. It rejects with what vex throws: `code` is
  // `'unsatisfiable'` when the writer found no query for the intent and
  // `'scope_denied'` when what it wrote reaches past the policy.
  answerIntent: (
    writers: { generateDsl: GenerateDsl; mapToShape: MapToShape },
    asked: { intent: string; shape: unknown; context?: Record<string, unknown> },
  ) => Promise<QueryResponse>;
  // Record one model run. `at`, `principal` and `shellId` are stamped here, so a
  // caller supplies only what it knows: which agent, which model, what was said,
  // what it cost. A no-op when the manifest declares no `runs` sink.
  recordRun: (run: Omit<RunRecord, 'at' | 'principal' | 'shellId'>) => void;
};

// A canvas seed, or CANDIDATES: with a list, the FIRST action the
// principal holds mounts — members boot `home`, anonymous boots the lock
// screen, and nobody configures which (ring 1 as derivation).
export type CanvasSeed = string | { action: string; input?: Record<string, unknown>; with?: string[] };
export type ShellCanvas = Omit<CanvasConfig, 'initial'> & { initial?: CanvasSeed | CanvasSeed[] };

export type ShellManifest = {
  canvases: ShellCanvas[];
  // The FRAME — the canvas arrangement, a layout of CanvasSlot markers.
  // Served to terminals verbatim; the terminal owns nothing but pixels.
  layout?: LayoutNode;
  // THE INITIAL LAYOUT STORE — what a `{ ref: id }` in the frame resolves to
  // before anything calls `setLayout`. A dynamic region embeds `{ ref: 'dock' }`
  // in `layout` above and this seeds what it draws; `shell.setLayout('dock', …)`
  // then swaps it and the change re-sends the frame. NOT `layouts` (above, on
  // NiscApp) — those are per-role variants of ACTION layouts; this seeds the
  // shell's layout STORE, mirroring nova's own `createShell({ layoutStore })`.
  layoutStore?: Record<string, LayoutNode>;
  fragments?: Record<string, ActionFragment>;
  // Per-principal canvas SEEDING — the instance twin of `inputs`. Where
  // `initial` is static data and `inputs` derives per-principal boot DATA,
  // `seeds` derives per-principal boot INSTANCES: the app computes, from the
  // session (and its own reads over the session's wire), which actions to
  // push onto which canvases. moss does nothing but call it and push, in
  // order, ring-1-filtered like every other mount — an ungranted seed simply
  // doesn't. May be async (a derivation usually reads resolved rows); seeds
  // land when it resolves, and attached terminals see them arrive.
  seeds?: (session: {
    principal: string | null;
    actions: readonly string[];
    roles: readonly string[];
    wire: FetchFn;
  }) => Promise<Record<string, CanvasSeed[]>> | Record<string, CanvasSeed[]>;
  // Component CONTRACTS for the server registry — name → { meta }. The
  // React components stay in the terminal; only their meta crosses, so
  // the layout agent's palette (meta.description / meta.propsSchema) works
  // server-side. Names listed here are registered even when no authored
  // layout mentions them (generated layouts may).
  components?: Record<string, { meta?: { description?: string; propsSchema?: unknown } }>;
  // Per-principal boot DATA, merged over each canvas's static seed.
  //
  // ASYNC AND WIRE-BEARING, matching `seeds`: a hook that cannot await, asked a
  // question about rows, has one implementation available to it, a map of
  // everybody. A synchronous implementation still satisfies this.
  inputs?: (session: {
    principal: string | null;
    actions: readonly string[];
    roles: readonly string[];
    // The scope values the app's own `identity` seam returned — handed straight
    // back so a shell can be composed from the record the session already
    // resolved, instead of reaching into a directory for the same facts.
    identity: Record<string, unknown>;
    wire: FetchFn;
  }) => Record<string, Record<string, unknown>> | Promise<Record<string, Record<string, unknown>>>;
};

// A page: a shell manifest, and the path it is drawn at. `:name` segments are
// parameters ("/docs/:slug"); every other segment matches itself.
export type PageManifest = ShellManifest & {
  path: string;
  // The canvas whose seed receives the path's parameters as input (merged over
  // `inputs`, which a page may still derive). Absent: the parameters go nowhere,
  // which is right for a path that has none.
  params?: string;
};

// The one name an app file needs besides its artifacts. It returns its
// argument: a manifest is read by its schema, and frozen, where it is handed
// over (./handover.ts), so an app may still assemble it after this call.
export const defineApp = (app: NiscApp): NiscApp => app;
