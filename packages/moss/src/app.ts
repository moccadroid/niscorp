import type { ScopeBehaviors, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, ActionFragment, CanvasConfig, FetchFn, FunctionHandler, LayoutNode, Shell } from '@niscorp/nova';
import type { NiscRuntime } from './runtime';

// ═══════════════════════════════════════════════════════════════
// The application, as data. Every field is an ARTIFACT — content someone
// authored — never machinery: the server derives everything mechanical
// from these plus a database (SERVER.md §2.6, derivation over
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
  // the prewarmed API surface — every read and write the app serves, as
  // authored entries; seeded into the cache at boot (idempotent, protected).
  // Optional because a database may already carry its vex_cache rows.
  entries?: readonly (SeedEntry | SeedMutation)[];
  // resource name → the entity subgraph it exposes as /api/<name>/vex
  // (a bare list, or an object carrying one — an app's resource artifacts
  // pass through unmapped). The bare /api/vex (full schema) always exists.
  resources?: Record<string, readonly string[] | { entities: readonly string[] }>;
  // The shell, as data (SERVER.md §2.4 — the shell runs on the server):
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
};

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
