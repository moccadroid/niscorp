import type { RenderNode, Shell } from '@niscorp/nova';

// What a host answers, and what a transport holds of one session. What a host
// is handed is ./config.ts.

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
  // What the app consists of changed (the actions in force are others now, a
  // role moved, an integration was installed or removed): every LIVING durable
  // shell is brought level with what its principal holds now, in place.
  // Definitions that arrived or changed are registered, mounted instances keep
  // their state, and new actions become pushable without a rebuild. One that
  // left, or is no longer granted, is removed: its instances are unmounted. A
  // shell that cannot adopt is logged and keeps what it held; the rest go on.
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
