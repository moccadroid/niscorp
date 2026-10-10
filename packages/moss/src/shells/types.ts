import type { ActionDefinition, FetchFn, LayoutNode, RenderNode, Shell } from '@niscorp/nova';
import type { QueryResponse, ScopePolicy } from '@niscorp/vex';
import type { Intent, QueryWriters } from '../data';
import type { Catalog, NiscApp, ShellManifest } from '../manifest';
import type { NiscRuntime } from '../runtime';
import type { ShellNeed } from './liveness';

// What a host is handed, what it answers, and what a transport holds of one
// session: the types of the module, in one place. Every other file here is one
// job.

// WHAT A SHELL NEEDS OF A CONNECTION ATTACHED TO IT: somewhere to send a
// frame, a way to end it, and how a sign-in is handed to its terminal. Three
// of the members a transport's connection has (the socket's `Connection` is
// one of these), so a host can be held with nothing but a place to send to.
export type ShellConnection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  // Set by the socket when the terminal's browser holds a seal: a session is
  // then handed over sealed. Absent, it is handed over as its token.
  seal?: (token: string) => Promise<string>;
};


// WHO A SHELL IS BEING BUILT FOR, resolved ONCE.
//
// A shell used to ask four separate synchronous questions about its principal,
// every one of them ultimately answered by a resident map of the whole
// population. One async answer replaces all four. This seam arrives last in the
// migration because `inputs` decides what MOUNTS and so cannot be deferred the
// way `seeds` can — which is exactly why it was the last thing still forcing an
// application to hold a directory.
export type ShellPrincipal = {
  roles: readonly string[];
  // The app's own scope values, passed back to `inputs` untouched. Moss never
  // looks inside; it is the app's record, on its way back to the app.
  scope: Record<string, unknown>;
  // The tenant's live integrations. Carried because `adopt` has to recompute a
  // catalog when the ACTIONS change, and a catalog that forgot which integrations were
  // installed would hand every studio every integration's screens.
  installed: readonly string[] | undefined;
  catalog: Catalog;
  variants: ReadonlyMap<string, LayoutNode>;
  policy: ScopePolicy;
};

export type ShellHostContext = {
  app: NiscApp;
  // THE ACTIONS IN FORCE NOW (./manifest). Asked each time a shell is built
  // and each time living shells adopt, because what the app consists of
  // changes while a host stands: an approved integration's actions arrive
  // after boot. Absent: what the app shipped, which is the whole of it for a
  // host that stands by itself.
  actions?: () => Readonly<Record<string, ActionDefinition>>;
  // WHICH SHELL THIS HOST BUILDS. Default: the app's own (`app.shell`). A PAGE
  // is the other answer — a manifest of its own, drawn per request.
  manifest?: ShellManifest;
  // Whether a principal's shell is KEPT. Default true: the app's shell is one
  // durable shell per person, the thing that rearranges itself around them. A
  // page's is not — `false` builds a shell for the length of one read or one
  // connection, whoever is asking, and runs no `onSession` (session code is the
  // app's; a page has none).
  kept?: boolean;
  // What one definition needs once drawn (./liveness.ts). Absent, every screen is
  // counted live — a host that cannot ask must not conclude a page is finished.
  needOf?: (definition: ActionDefinition) => ShellNeed;
  // The one resolution, awaited once per shell build.
  resolve: (principal: string | null) => Promise<ShellPrincipal>;
  // The same derivations keyed by ROLES rather than by principal, for `adopt`.
  // Adopting is for changed ARTIFACTS, not changed people: the roles a live
  // shell was built with are still its roles, so re-resolving them would be a
  // round trip to learn what the cell already knows.
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  variantsFor: (roles: readonly string[]) => ReadonlyMap<string, LayoutNode>;
  // The internal wire: the server's own fetch, authorized as the session.
  wire: (token: string | null) => FetchFn;
  // LAID AROUND THE WIRE A SESSION'S SCREENS CALL THROUGH, by whoever has a
  // reason to answer for a call that failed (an integration that is down gets
  // a sentence under it; ./integrations, floor.ts). It wraps the wire the
  // shell's endpoints and functions are handed, and not the one `inputs` and
  // `phrases` read through. Absent: the wire as it is.
  wrapWire?: (inner: FetchFn) => FetchFn;
  // AN INTENT ANSWERED BY A QUERY WRITTEN FOR IT, as a principal (./data,
  // intents.ts): what a session's `answerIntent` asks. Whose policy and
  // scope values it runs under is resolved by whoever supplies this, each time
  // it is asked. Absent: a session that asks is told this host cannot.
  answerIntent?: (principal: string | null, writers: QueryWriters, asked: Intent) => Promise<QueryResponse>;
  // The environment and the per-principal policy — what the manifest's
  // in-process functions close over (agents read data under the policy).
  runtime: NiscRuntime;
  // How long a durable shell may sit with NOTHING attached before it is
  // disposed. Default `DEFAULT_IDLE_MS`; `0` or `Infinity` disables the sweep
  // and shells live until sign-out or process exit. Only the idle clock is
  // swept — there is deliberately no absolute cap, because that would discard
  // the state of somebody who is working.
  idleMs?: number;
  // Send a changed canvas as a delta against the frame the connection last
  // received, instead of whole. Default off; a connection is only ever sent one
  // if it asked at attach. See `runtime.shellFrameDelta` and DOCS.md.
  delta?: boolean;
};

export type ShellSession = {
  // The living nova Shell — for in-process hosts (dev checks, embedded
  // tools) that drive it directly. Remote clients ride attach/dispatch.
  // A GETTER, not a field: `reset` replaces the shell under a session that
  // callers already hold, and a snapshot taken at session time would go on
  // addressing the disposed one.
  readonly shell: Shell;
  // `options.delta` is the terminal declaring it can apply frame deltas. Absent
  // means whole frames, which is what every terminal predating them expects.
  attach: (connection: ShellConnection, options?: { delta?: boolean }) => void;
  detach: (connection: ShellConnection) => void;
  // This connection's copy of a canvas drifted from the server's — send whole
  // frames until it is level again. The shell is untouched.
  resync: (connection: ShellConnection) => void;
  dispatch: (canvas: string, event: Record<string, unknown>) => void;
  publish: (channel: string, payload?: unknown) => void;
  // Undo the shell's last navigation (nova's journal — see its `back`). Nothing
  // is sent in answer: the shell's own state change flushes the canvases that
  // moved, which is how every other change reaches a terminal. `false` when
  // there was nothing left to undo — the answer a landing screen gives.
  back: () => boolean;
  // Unmount everything above `instance` on `canvas` — the breadcrumb's jump,
  // done in one step by the shell that owns the stack.
  popTo: (canvas: string, instance: string) => void;
  // Throw this shell away and build its replacement, carrying every attached
  // connection across. The session object stays valid; the terminals receive a
  // fresh frame and current trees, exactly as on (re)attach.
  reset: () => void;
};

// One living shell, as an operator needs to see it. Structural facts only —
// who holds it, how many terminals are attached, how long it has been there,
// and the action ids on its canvases. Naming the principal is the app's job.
export type ShellReport = {
  principal: string;
  // terminals attached right now
  connections: number;
  // when this shell was BUILT — a reset moves it, because what stands after a
  // reset is a new shell
  since: number;
  // when the last connection detached; null while one is attached
  idleSince: number | null;
  // canvases with anything mounted, top of stack first
  canvases: { id: string; actions: readonly string[] }[];
};

// What a terminal would be sent on attach, as one value: the frame and every
// canvas's current tree. A DOCUMENT is rendered from it (server-side, with the
// app's kit) and carries it, so the terminal starts from the screen the page
// already shows instead of from nothing.
export type ShellSnapshot = {
  frame: RenderNode[];
  trees: Record<string, RenderNode[]>;
  // Set for an anonymous snapshot: the id seed its shell was built under. The
  // terminal names it on the socket (`?seed=`), the throwaway shell built for
  // that connection mints the same ids, and the first frames match the page.
  seed?: string;
  // False when the wait ran out with something still loading — the snapshot is
  // then the screen as it stood (its skeletons included), which is still a
  // screen and still correct.
  settled: boolean;
  // WHETHER ANYTHING ON THIS SCREEN CAN STILL HAPPEN (./liveness.ts), asked of the
  // actions actually mounted for whoever this is. False: the trees are the whole
  // of it, and a terminal has no reason to open a socket. `why` says what makes
  // it live, one line per reason; `drawnWith` names the reads whose answers are
  // already in the trees.
  live: boolean;
  why: string[];
  drawnWith: string[];
};

// What a session or a snapshot may be given beside who it is for.
export type ShellOpening = {
  // Build an ephemeral shell under this id seed (see ShellSnapshot.seed).
  seed?: string;
  // Input for canvas seeds, by canvas id — merged over the manifest's own
  // `inputs`. A page's path parameters arrive here.
  inputs?: Record<string, Record<string, unknown>>;
};

export type ShellHost = {
  // `options.seed`: build an EPHEMERAL session's shell under this id seed (see
  // ShellSnapshot). Ignored for a kept shell — it is durable, and the one a
  // document was rendered from is the one the socket attaches to.
  session: (token: string | null, principal: string | null, options?: ShellOpening) => Promise<ShellSession>;
  // The current screen for whoever this is, without attaching anything. A
  // principal's durable shell is built if it is not standing (the socket would
  // have built it a moment later) and kept; an anonymous one is built, read and
  // disposed. Waits for the screen to settle — `seeds` pushed, no instance
  // still mounting — for at most `waitMs`, then serves what is there.
  snapshot: (token: string | null, principal: string | null, options?: { waitMs?: number; inputs?: ShellOpening['inputs'] }) => Promise<ShellSnapshot>;
  // Artifacts changed (the actions in force are others now, the server dropped
  // its memos): every LIVING durable shell adopts its freshly-resolved granted
  // definitions in place — nova's registerAction adds or replaces, mounted
  // instances keep their state, and new actions become pushable without a
  // rebuild. Ring 1 is re-applied per principal; ring 2 substitutes exactly
  // as at build.
  adopt: () => void;
  // Publish a message into one principal's LIVE durable shell — the push half
  // of the socket the shells already run. Whatever action is mounted and
  // listening on the channel reacts, re-renders, and the change fans out to
  // every attached terminal over the existing wire. `false` when they hold no
  // living shell, which is an answer, not an error: offline people read the
  // rows later. Nothing here builds a shell.
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
  // Every durable shell alive right now. The honest roster: moss owns the map,
  // so moss is the only thing that can enumerate it without keeping a
  // second, drifting note beside it.
  list: () => ShellReport[];
  // Reset one principal's durable shell. `false` if they hold none — which is
  // not an error, it is the answer to "is Rosa's shell stuck?" when Rosa is
  // not connected. Anonymous shells are not addressable here (they are
  // per-connection and die on detach); a terminal resets its own via the
  // session's `reset`.
  reset: (principal: string) => boolean;
  // Stop the idle sweep. For hosts that outlive their server (dev checks,
  // embedded tools); the timer is unref'd, so a plain process needn't call it.
  stop: () => void;
};
