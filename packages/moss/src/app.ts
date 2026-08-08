import type { ScopeBehaviors, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, ActionFragment, CanvasConfig, FetchFn, FunctionHandler, LayoutNode, Shell } from '@niscorp/nova';
import type { NiscRuntime } from './runtime';

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
  assignments: Record<string, readonly string[]>;
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
  scope?: (principal: string | null) => Record<string, unknown>;
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
  inputs?: (session: {
    principal: string | null;
    actions: readonly string[];
    roles: readonly string[];
  }) => Record<string, Record<string, unknown>>;
};

// Identity today, a validation seam tomorrow — and the one name an app
// file needs besides its artifacts.
export const defineApp = (app: NiscApp): NiscApp => app;
