import type { ScopeBehaviors, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, ActionFragment, CanvasConfig, FetchFn, FunctionHandler, LayoutNode, Shell } from '@niscorp/nova';
import type { PhraseKeys, Phrasebook } from '@niscorp/nova/i18n';
import type { NiscRuntime } from './runtime';
import type { IdentityRecord } from './identity';

// ═══════════════════════════════════════════════════════════════
// The application, as data. Every field is an ARTIFACT — content someone
// authored — never machinery: the server derives everything mechanical
// from these plus a database (DESIGN.md § Derivation over
// configuration). `assignments` stands in for the artifact library's
// assignment table until that exists.
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
  // THE ASSIGNMENT MAP — one entry per principal, and the reason a resident
  // copy of the population had to exist at all: an eager `Record` cannot be
  // filled without enumerating everybody.
  //
  // OPTIONAL now. An app that declares `identity` answers this per principal,
  // asynchronously, one row at a time, and never builds the map. What remains
  // here is for apps whose assignments are AUTHORED — a handful of static
  // rungs in a demo — where a literal is the honest shape.
  assignments?: Record<string, readonly string[]>;
  // WHICH ROLE COMBINATIONS A PRINCIPAL MAY HOLD — declared, not counted.
  //
  // The two coherence gates below (`verifyCharter`'s subtractive-assigned rule,
  // `verifyVariants`' one-variant-per-action rule) never wanted principals; they
  // wanted the distinct COMBINATIONS somebody could wear. Reading them off
  // `assignments` is the only reason that map has to be eager — and enumerating
  // the population to learn that `['instructor','member']` exists is a strange
  // way to learn it.
  //
  // The charter cannot supply this. It defines roles; it does not know which of
  // them coincide on one person, because that is a fact about the application's
  // schema (staff row AND membership row), not about the grant graph.
  //
  // Absent = derived from `assignments`, which is what every app did before this
  // existed and is correct while the map is still eager.
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
  // VOLATILE VALUES ONLY, once `identity` below exists. A resolved identity is
  // held for a session; anything derived from the CLOCK must not be, or a
  // session opened before midnight serves yesterday's date to every query that
  // compares a DATE column against it. So this seam survives beside `identity`
  // and is asked per request — and it stays synchronous on purpose, because the
  // values that belong here are COMPUTED rather than read. A sync signature is
  // only a trap when the answer lives in rows.
  //
  // The resolved record is handed in so the computation has what it needs
  // without a lookup: the day is derived from the timezone the record already
  // carries. Merged OVER the record's own scope values.
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  // WHO A PRINCIPAL IS, resolved ONCE per session instead of asked in pieces
  // per request — the seam that replaces `scope` + `assignments` +
  // `installedIntegrations` with a single async answer.
  //
  // The three seams around this one are synchronous, and that is not a detail:
  // a hook that cannot await has exactly one implementation available to it
  // when the answer lives in rows, and that implementation is a resident map of
  // the whole population. Lyra grew eight of them across three files, and every
  // one exists to satisfy a signature rather than a decision. This is the same
  // question asked in a tense that permits the obvious answer — read the row.
  //
  // Moss OWNS the resulting cache: bounded, evicted, revalidated on
  // `sessionRevalidateMs`, and enumerable only by an operator (see identity.ts,
  // and the invariants in docs/plans/lyra-identity.md Part 6). What it will
  // never do is look inside the record. `roles` goes to charter, `installed` is
  // filtered against, `scope` is merged into the engine's scope values — all
  // pass-through. The moment moss reads `.studioId` off one of these, moss has
  // learned what a tenant is and the boundary is gone.
  //
  // Absent = the three older seams answer, exactly as before.
  identity?: (principal: string) => Promise<IdentityRecord>;
  // THE WORDS THIS PRINCIPAL'S SHELL WEARS — the language twin of `scope`.
  //
  // Moss renders a shell server-side and serializes its trees. Between those
  // two, every word the reader will see is present at once, so that is where a
  // language is applied: one pass over the frame (`@niscorp/nova/i18n`), source
  // phrase in, translated phrase out. Nothing downstream — the socket, the
  // delta encoder, the terminal — learns that a language exists.
  //
  // Returning undefined or an empty book is the SOURCE language, and costs
  // nothing: the pass returns the same tree object and the frame serializes to
  // the bytes it always did.
  //
  // Per PRINCIPAL, because a shell is per principal. Two people at the same
  // tenant reading different languages get two shells, which they already had.
  // Resolved once when the shell is built — a change to a principal's language
  // is a `reset`/rebuild, exactly like a change to their catalog.
  // May be async, for the same reason `seeds` and `inputs` are: a book that
  // lives in rows cannot be fetched by a function that cannot await, and the
  // only implementation a sync signature leaves is a resident copy of every
  // language.
  phrases?: (principal: string | null) => Phrasebook | undefined | Promise<Phrasebook | undefined>;
  // Which keys in a tree carry prose. An app with its own display-field
  // convention (`status_display`) declares it once here. Absent = nova's
  // default prop set and no suffix rule.
  phraseKeys?: PhraseKeys;
  // WHICH INTEGRATIONS ARE LIVE FOR THIS PRINCIPAL'S TENANT.
  //
  // The charter grants `ext.desk.*` once, to every desk in the deployment. In a
  // single-tenant app that is the whole answer. In a multi-tenant one it is a
  // leak: one studio installing a pack would put it on every studio's front
  // desk, and nothing would say so.
  //
  // Moss cannot decide this — it does not know what a tenant is, deliberately,
  // for the same reason `scope` exists. So the app answers, with a list of
  // integration ids, and moss drops every `ext.*` action outside it.
  //
  // Absent = every registered integration is live for everybody, which is right
  // for an app with one tenant and wrong the moment there are two.
  // May be async, like every other per-principal seam here now.
  installedIntegrations?: (principal: string | null) => readonly string[] | Promise<readonly string[]>;
  // WHO AN INTEGRATION IS when it acts and nobody is driving.
  //
  // A webhook lands, a nightly sync runs: the integration presents its minted
  // key and names who it acts for (`x-nisc-acts-for` — a tenant in most apps,
  // and opaque to moss for the same reason `scope` is). The app answers with a
  // principal, and from there NOTHING is special: that principal's charter
  // rung compiles its policy, `scope` gives it its values, and the engine
  // stamps its writes — the integration is just another client of the same
  // closed grammar.
  //
  // Returning null refuses: an integration the tenant has not installed, a
  // tenant that does not exist, an app that has no actor for unattended work.
  // Absent = integration keys resolve to nobody and every keyed call is 403.
  // MAY BE ASYNC, and this is the first of the six per-principal seams to say
  // so. A synchronous signature cannot perform I/O, so an app answering this
  // question about rows had exactly one implementation available to it: hold
  // the rows. That is how a resident copy of the database gets built by a type
  // rather than by a decision (docs/plans/lyra-identity.md, Part 1).
  //
  // Nothing here needed it: moss resolves this inside async middleware, one
  // call per keyed request, and has awaited the session verifier beside it
  // since the beginning. A sync implementation still satisfies this — the
  // widening is the point, not a migration.
  integrationActor?: (integration: string, actsFor: string) => string | null | Promise<string | null>;
  // WHERE AN INTEGRATION MAY APPEAR — the host's half of the placement
  // contract, advertised on the discovery surface and enforced at intake.
  //
  // `attachable`: host action id → the offers, as {offered key: host data
  // path} (a member detail offering `membership_id` from `$.membershipId`).
  // Declaring an action here is declaring a seat. The KEYS are the contract —
  // advertised on discovery, what a rider receives as input and what a
  // preview call carries. The PATHS are the host's private wiring: how its
  // own strip derivation and push trigger read those values off its data —
  // a rider never sees them.
  attachable?: Record<string, Record<string, string>>;
  // `menuSlots`: hub action ids whose item lists accept placed integration
  // screens. Who owns a menu is the host's question; this list is its answer,
  // and intake refuses a placement outside it.
  menuSlots?: readonly string[];
  // WORDS FOR THE IDS ABOVE, for the one sentence a person reads before
  // turning a pack on. Optional: without it the approval card and store tile
  // print ids, which is honest and unhelpful.
  placementNames?: Readonly<Record<string, string>>;
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
  // The `fn:` escape hatch, server-side: app code running IN-PROCESS next
  // to the session's durable shell (Ray lives here). Built once per
  // session — handlers close over the session context, so keys and code
  // never reach a browser. Side-effect-free computation deploys as server
  // functions behind plain `url:` endpoints instead (/fns, later).
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
  // The write-fact bridge. Vex is the choke point every write passes
  // through; when an app runs tide, each committed statement is minted into
  // it as a `{ kind: 'write' }` fact — entity, op, and the row the database
  // returned — stamped with the identity `identity(scope)` names. That
  // identity is the fact's tenancy fence: tide offers a fact only to
  // reflexes running AS the same identity, so whose write it was decides
  // who may be woken by it. Returning undefined mints nothing for that
  // write (an operator surface, a write with no tenant). `tide` is a
  // getter because the instance stands up after the server does.
  //
  // Rows travel HERE and into tide's ledger only — host plumbing on one
  // side, the identity fence on the other. They never reach `onMutation`.
  //
  // The intake is structural — hand back the tide DRIVER, so a minted fact
  // wakes the engine instead of waiting for anybody's beat.
  facts?: {
    tide: () => FactIntake | undefined;
    identity: (scope: Record<string, unknown>) => string | undefined;
    // The causality gate. A tide effect that writes back through vex
    // forwards its chain position as request headers (`x-tide-cause`,
    // `x-tide-depth`); this decides whether THAT CALLER's word is good —
    // return the hints to accept them onto the minted facts, undefined to
    // drop them. Absent = hints are always dropped, which is the safe
    // default: a forged depth could park an innocent chain, and a forged
    // cause is fabricated provenance. An app grants this to exactly the
    // principals that ARE its automation rungs.
    chain?: (scope: Record<string, unknown>, hints: { cause: string; depth: number }) => { cause: string; depth: number } | undefined;
  };
};

// The one verb the bridge needs. Both `Tide` and `TideDriver` satisfy it;
// hand out the driver unless you have a reason to want facts that wait.
export type FactIntake = Pick<import('@niscorp/tide').Tide, 'ingest'>;

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

// What a session's functions close over: the living shell (durable per
// principal), who is calling, the server's own surfaces as the session,
// the environment the server stands on, and the principal's compiled
// scope policy — dynamic reads (agents) execute under it, so an agent
// sees what its caller sees and is refused what its caller is refused.
export type FunctionSession = {
  shell: Shell;
  principal: string | null;
  roles: readonly string[];
  wire: FetchFn;
  runtime: NiscRuntime;
  policy: ScopePolicy;
  // Session lifecycle, as capabilities — no reserved channels, no
  // observers. A login fn GRANTS: the token goes down every connection of
  // this session as a `session` message and the terminals reconnect
  // authenticated. A sign-out fn REVOKES: every connection closes
  // SIGNED_OUT and the durable shell dies.
  grant: (token: string) => void;
  revoke: () => void;
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
  //
  // ASYNC AND WIRE-BEARING, matching `seeds`. These two are called twins a few
  // lines apart, and one was handed the governed internal wire while the other
  // was not. That asymmetry is the origin of every resident cache in this repo:
  // a hook that cannot await, asked a question about rows, has exactly one
  // implementation available to it, and that implementation is a map of
  // everybody (docs/plans/lyra-identity.md, Part 1). A synchronous
  // implementation still satisfies this — the widening is the point.
  inputs?: (session: {
    principal: string | null;
    actions: readonly string[];
    roles: readonly string[];
    // The scope values the app's own `identity` seam returned — handed straight
    // back so a shell can be composed from the record the session already
    // resolved, instead of reaching into a directory for the same four facts.
    identity: Record<string, unknown>;
    wire: FetchFn;
  }) => Record<string, Record<string, unknown>> | Promise<Record<string, Record<string, unknown>>>;
};

// Identity today, a validation seam tomorrow — and the one name an app
// file needs besides its artifacts.
export const defineApp = (app: NiscApp): NiscApp => app;
