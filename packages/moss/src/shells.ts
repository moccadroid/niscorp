import { createShell, createComponentRegistry, CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from '@niscorp/nova';
import { componentsOf, snapshotShell } from '@niscorp/nova/reflect';
import type { Shell, CanvasConfig, FetchFn, LayoutNode, RenderNode } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { ScopePolicy } from '@niscorp/vex';
import type { FunctionSession, NiscApp } from './app';
import type { NiscRuntime } from './runtime';
import type { Catalog } from './principal';
import { CLOSE_SIGNED_OUT } from './socket';
import type { Connection, ServerMessage } from './socket';

// ═══════════════════════════════════════════════════════════════
// The shell host (DESIGN.md § The shell runs on the server): the shell
// runs here, the client is a canvas terminal. One durable shell per authenticated
// principal (the socket is ephemeral: connections attach and detach, the
// shell survives — reattach just re-sends current trees, and N attached
// connections receive the same frames: shared canvases are the same
// mechanism). Anonymous connections get a throwaway shell, disposed with
// the connection.
//
// The shell is built from the manifest's `shell` artifacts: canvases and
// fragments are data; `inputs` is the app's one derivation hook (per-
// principal boot input — nav flags, user chips). Everything else is
// derived here: the granted action set from the catalog (an ungranted
// initial simply doesn't mount — ring 1), ambient transform context from
// the session, and every endpoint call rides the server's OWN surfaces
// with the session's token — the server shell is just another
// principal-bound client of the same wire, enforcement included.
//
// Because the shell is durable and keyed by PRINCIPAL, a wedged one is not
// something a client can escape: dropping the token and reconnecting gets
// you a throwaway anonymous shell, and signing back in hands you the same
// wreck. Recovery is therefore a server verb, not a client gesture — hence
// `reset`, which disposes a shell and builds its replacement from the same
// derivation boot ran, carrying the attached connections across so every
// terminal simply receives a fresh frame. `list` is the truthful roster
// that makes an operator able to find the shell to reset; the idle sweep is
// the same disposal on a timer, and safe for the reason DESIGN.md gives —
// the projection is the durable thing, a shell is a warm cache.
// ═══════════════════════════════════════════════════════════════

export type ShellHostContext = {
  app: NiscApp;
  catalog: (principal: string | null) => Catalog;
  // Ring-2 bindings: action id → the granted variant's layout (empty map =
  // every action serves its base layout).
  variants: (principal: string | null) => ReadonlyMap<string, LayoutNode>;
  roles: (principal: string | null) => readonly string[];
  // The internal wire: the server's own fetch, authorized as the session.
  wire: (token: string | null) => FetchFn;
  // The environment and the per-principal policy — what the manifest's
  // in-process functions close over (agents read data under the policy).
  runtime: NiscRuntime;
  policy: (principal: string | null) => ScopePolicy;
  // How long a durable shell may sit with NOTHING attached before it is
  // disposed. Default `DEFAULT_IDLE_MS`; `0` or `Infinity` disables the sweep
  // and shells live until sign-out or process exit. Only the idle clock is
  // swept — there is deliberately no absolute cap, because that would discard
  // the state of somebody who is working.
  idleMs?: number;
};

export type ShellSession = {
  // The living nova Shell — for in-process hosts (dev checks, embedded
  // tools) that drive it directly. Remote clients ride attach/dispatch.
  // A GETTER, not a field: `reset` replaces the shell under a session that
  // callers already hold, and a snapshot taken at session time would go on
  // addressing the disposed one.
  readonly shell: Shell;
  attach: (connection: Connection) => void;
  detach: (connection: Connection) => void;
  dispatch: (canvas: string, event: Record<string, unknown>) => void;
  publish: (channel: string, payload?: unknown) => void;
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

export type ShellHost = {
  session: (token: string | null, principal: string | null) => ShellSession;
  // Artifacts changed (the app mutated its `actions`, the server dropped its
  // memos): every LIVING durable shell adopts its freshly-resolved granted
  // definitions in place — nova's registerAction adds or replaces, mounted
  // instances keep their state, and new actions become pushable without a
  // rebuild. Ring 1 is re-applied per principal; ring 2 substitutes exactly
  // as at build.
  adopt: () => void;
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

// A shell nobody has been attached to for half an hour is a warm cache with no
// reader. Rebuilding costs one derivation pass on the next connect.
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

// The sweep never runs less often than this, so a short `idleMs` is honoured
// closely and a long one doesn't cost a wakeup per minute.
const SWEEP_EVERY_MS = 60 * 1000;

const today = (): string => new Date().toISOString().slice(0, 10);

export const createShellHost = (ctx: ShellHostContext): ShellHost => {
  const manifest = ctx.app.shell;
  if (manifest === undefined) throw new Error('createShellHost: the app manifest has no `shell`.');
  const shellManifest = manifest;

  // Every component NAME the app's layouts mention — nova's registry holds
  // opaque components (generic, unknown), so the server registers name-only
  // stubs: the render pipeline validates names and serializes trees; actual
  // components live in the terminal. `componentsOf` (nova/reflect) is the one
  // walk; no component list is ever authored. nova's own slot markers come
  // from default layouts, not the app's, so the walk can't find them — seed
  // them first.
  const componentNames = new Set<string>([CANVAS_SLOT_NAME, ACTION_SLOT_NAME]);
  for (const source of [ctx.app.actions, ctx.app.layouts ?? {}, shellManifest.canvases, shellManifest.layout ?? {}, shellManifest.fragments ?? {}]) {
    for (const name of componentsOf(source)) componentNames.add(name);
  }
  // Declared contracts register even when no authored layout mentions them
  // (generated layouts may name them; the palette must see them).
  const contracts = shellManifest.components ?? {};
  for (const name of Object.keys(contracts)) componentNames.add(name);

  type Live = {
    shell: Shell;
    connections: Set<Connection>;
    // last frame per canvas — only changes are sent (structural diffing
    // inside the render message stays a later optimization)
    sent: Map<string, string>;
    flushing: boolean;
    // set when the session ends (sign-out, reset, eviction) — pending flush
    // passes must not render a disposed shell
    ended: boolean;
    // built at; and when the last connection left (null while attached)
    since: number;
    idleSince: number | null;
  };

  // The indirection `reset` needs. A session, a socket and the durable map all
  // address a principal's shell through ONE mutable cell, so replacing the
  // shell reaches every holder at once and nobody is left pointing at a
  // disposed one. The token is kept beside it because a rebuild has to
  // re-authorize the server's own wire as the same session, and it is
  // refreshed on reattach so a rebuild uses the newest one the principal
  // arrived with rather than the one they first appeared with.
  type Cell = { live: Live; token: string | null; principal: string | null };

  // No visible content = empty tree over the wire. A canvas whose layout
  // renders to nothing but empty text / empty wrappers (the collapsed aside
  // rail) is sent as [] — so a terminal can collapse chrome on `length`
  // alone, knowing nothing about node shapes. An ActionSlot marker is a
  // BOUNDARY, not content — visibility is decided by what's inside it.
  const hasVisibleContent = (nodes: RenderNode[]): boolean =>
    nodes.some((node) => {
      if (node.type === 'text') return node.value !== '';
      if (node.type === 'fragment') return hasVisibleContent(node.children);
      if (node.type === 'component' && node.name === 'ActionSlot') return hasVisibleContent(node.children);
      return true;
    });

  const frame = (live: Live, canvasId: string): string => {
    const tree = live.shell.flattenRenderTree(live.shell.getCanvasRenderTree(canvasId));
    const message: ServerMessage = {
      type: 'render',
      canvas: canvasId,
      tree: hasVisibleContent(tree) ? tree : [],
    };
    return JSON.stringify(message);
  };

  // A canvas whose tree throws while rendering must not take the session with
  // it. Unguarded, one bad tree killed the entire flush pass: every canvas
  // after it never rendered, the throw escaped a microtask with nobody to
  // catch it, and — because `sent` was never updated for the canvas that threw
  // — every later pass hit the same node again. That is a shell wedged for the
  // life of the process, and no reconnect could clear it, since reattaching a
  // durable shell finds the same wreck. Now the failing canvas holds its last
  // good tree, its neighbours keep rendering, and `reset` is the way out.
  const frameOf = (live: Live, canvasId: string): string | null => {
    try {
      return frame(live, canvasId);
    } catch (error) {
      console.error(`[moss/shells] canvas "${canvasId}" failed to render — holding its last tree:`, error);
      return null;
    }
  };

  const durable = new Map<string, Cell>(); // principal → the one living shell

  const build = (token: string | null, principal: string | null): Live => {
    const { ids } = ctx.catalog(principal);
    const granted = new Set(ids);
    const bindings = ctx.variants(principal);
    const inputs = shellManifest.inputs?.({ principal, actions: ids, roles: ctx.roles(principal) }) ?? {};

    // Canvases are data; mounting is derivation: of the declared seed (or
    // CANDIDATE list) the first action the principal holds mounts — none
    // held, nothing mounts. Per-principal inputs merge over the static seed.
    const canvases: CanvasConfig[] = shellManifest.canvases.map((canvas) => {
      const declared = canvas.initial;
      const candidates = declared === undefined ? [] : Array.isArray(declared) ? declared : [declared];
      const seed = candidates.find((c) => granted.has(typeof c === 'string' ? c : c.action));
      if (seed === undefined) {
        const { initial: _dropped, ...rest } = canvas;
        return rest;
      }
      const action = typeof seed === 'string' ? seed : seed.action;
      const staticInput = typeof seed === 'string' ? {} : (seed.input ?? {});
      const withFragments = typeof seed === 'string' ? undefined : seed.with;
      const extra = inputs[canvas.id];
      return {
        ...canvas,
        initial: { action, input: { ...staticInput, ...(extra ?? {}) }, ...(withFragments !== undefined ? { with: withFragments } : {}) },
      };
    });

    const wire = ctx.wire(token);
    const userId = principal ?? 'anonymous';

    const registry = createComponentRegistry();
    for (const name of componentNames) registry.register(name, (contracts[name] ?? {}) as Parameters<typeof registry.register>[1]);

    // The manifest's in-process functions, built for THIS session — the
    // shell and the live connection set land in the closures just after
    // creation (a function that somehow runs before then fails loudly).
    let built: Shell | undefined;
    let liveRef: Live | undefined;
    const session: FunctionSession = {
        principal,
        roles: ctx.roles(principal),
        wire,
        runtime: ctx.runtime,
        policy: ctx.policy(principal),
        get shell(): Shell {
          if (built === undefined) throw new Error('moss: a function touched the shell before the session finished building.');
          return built;
        },
        // GRANT: the minted token to every terminal of this session — they
        // reconnect as the new principal; this (anonymous) session stays
        // ephemeral and dies on detach.
        grant: (token) => {
          const message = JSON.stringify({ type: 'session', token } satisfies ServerMessage);
          for (const connection of liveRef?.connections ?? []) connection.send(message);
        },
        // REVOKE: close every terminal SIGNED_OUT, evict the durable
        // shell. Deferred a microtask so the calling trigger finishes
        // before its own shell is disposed.
        revoke: () => {
          queueMicrotask(() => {
            if (liveRef === undefined) return;
            liveRef.ended = true;
            // Only if the map still holds THIS shell — a reset between the
            // sign-out and this microtask has already replaced it, and the
            // replacement belongs to whoever caused it.
            if (principal !== null && durable.get(principal)?.live === liveRef) durable.delete(principal);
            for (const connection of [...liveRef.connections]) connection.close(CLOSE_SIGNED_OUT, 'signed out');
            liveRef.connections.clear();
            if (principal !== null) liveRef.shell.dispose();
          });
        },
        // The session's own fields are stamped here so a caller cannot get them
        // wrong, and the shell id is read lazily — a run cannot happen before
        // the shell exists, but this object is built before it does.
        recordRun: (run) => {
          if (ctx.app.runs === undefined) return;
          ctx.app.runs({ ...run, at: Date.now(), principal, shellId: built?.id ?? '' }, session);
        },
    };

    // Endpoints first, then the non-endpoints. Both get the same session; only
    // the first produces handlers.
    const functions = ctx.app.functions?.(session) ?? {};
    ctx.app.onSession?.(session);

    const shell = createShell({
      registry,
      canvases,
      ...(shellManifest.layout !== undefined ? { canvasLayout: shellManifest.layout } : {}),
      // Ring 1 then ring 2: an ungranted action doesn't exist; a granted one
      // carries the principal's variant layout when they hold one — the swap
      // happens on the definition, before the shell exists, so everything
      // downstream (render, serialize, the wire) is already per-principal.
      actions: Object.fromEntries(
        Object.entries(ctx.app.actions)
          .filter(([id]) => granted.has(id))
          .map(([id, definition]) => {
            const layout = bindings.get(id);
            return [id, layout === undefined ? definition : { ...definition, layout }];
          }),
      ),
      ...(shellManifest.fragments !== undefined ? { fragments: shellManifest.fragments } : {}),
      // The same seam the client shell used: prism evaluates endpoint
      // request/response transforms; `$.userId` and `$.today` are ambient,
      // never authorable by a request.
      transform: (config, source) =>
        evaluate(
          config as Parameters<typeof evaluate>[0],
          (source !== null && typeof source === 'object' && !Array.isArray(source)
            ? { ...(source as Record<string, unknown>), userId, today: today() }
            : source) as Parameters<typeof evaluate>[1],
        ),
      fetch: wire,
      functions,
    });
    built = shell;

    // Born idle: a shell exists before anything attaches to it, and a shell
    // nothing ever attaches to is exactly what the sweep should collect.
    const live: Live = { shell, connections: new Set(), sent: new Map(), flushing: false, ended: false, since: Date.now(), idleSince: Date.now() };
    liveRef = live;

    // Per-principal canvas SEEDING — the instance twin of `inputs`. The app
    // derives which actions to push where (usually from resolved rows over
    // the session's own wire), moss pushes them in order: ring 1 filters
    // exactly as `initial` does, an unknown action or canvas skips rather
    // than kills the session, and seeds landing after attach simply render —
    // the same progressive path every later push takes.
    const declaredSeeds = shellManifest.seeds?.({ principal, actions: ids, roles: ctx.roles(principal), wire });
    if (declaredSeeds !== undefined) {
      void Promise.resolve(declaredSeeds)
        .then((byCanvas) => {
          if (live.ended) return;
          for (const [canvasId, seeds] of Object.entries(byCanvas ?? {})) {
            for (const seed of seeds) {
              const action = typeof seed === 'string' ? seed : seed.action;
              if (!granted.has(action)) continue;
              const input = typeof seed === 'string' ? undefined : seed.input;
              const withFragments = typeof seed === 'string' ? undefined : seed.with;
              try {
                shell.push(canvasId, action, input, withFragments);
              } catch {
                // an unknown canvas or definition is a skipped seed, not a
                // dead session
              }
            }
          }
        })
        .catch(() => {
          // a failed derivation seeds nothing — the canvas stays empty and
          // the rest of the shell is untouched
        });
    }

    // Any state or data change → re-render, send what changed, to every
    // attached connection. Microtask-coalesced, with one trailing pass a
    // tick later: some transitions (instance status settling after its
    // loads) land AFTER the last notification, and the trailing pass
    // catches the settled tree.
    const pass = (): void => {
      if (live.ended) return;
      for (const canvas of shellManifest.canvases) {
        const next = frameOf(live, canvas.id);
        if (next === null || live.sent.get(canvas.id) === next) continue;
        live.sent.set(canvas.id, next);
        for (const connection of live.connections) connection.send(next);
      }
    };
    const flush = (): void => {
      if (live.flushing) return;
      live.flushing = true;
      queueMicrotask(() => {
        live.flushing = false;
        pass();
        setTimeout(pass, 0);
      });
    };
    shell.onStateChange(flush);
    shell.onDataChange(flush);

    return live;
  };

  // (Re)attach: the frame first — the canvas arrangement, CanvasSlot markers
  // the terminal resolves — then every canvas's current tree, no replay
  // machinery. Both are guarded, because the one moment a terminal MOST needs
  // to be served is when the shell it is attaching to is the broken one: a
  // throw here would leave the connection open with nothing on it, which is
  // the failure that has no diagnosis.
  const attach = (live: Live, connection: Connection): void => {
    live.connections.add(connection);
    live.idleSince = null;
    let frameTree: RenderNode[] = [];
    try {
      frameTree = live.shell.getShellRenderTree();
    } catch (error) {
      console.error('[moss/shells] the shell frame failed to render — serving an empty arrangement:', error);
    }
    connection.send(JSON.stringify({ type: 'frame', tree: frameTree } satisfies ServerMessage));
    for (const canvas of shellManifest.canvases) {
      const next = frameOf(live, canvas.id);
      if (next === null) continue;
      live.sent.set(canvas.id, next);
      connection.send(next);
    }
  };

  // Dispose a shell and stand its replacement in the same cell, carrying the
  // attached connections across. Everything a shell is derived from — the
  // catalog, the variants, `inputs`, `seeds` — is re-read by `build`, so what
  // comes back is the screen boot would have served this principal now. The
  // terminals are not told anything: they receive a frame and current trees,
  // the same two messages a reconnect brings.
  const rebuild = (cell: Cell): void => {
    const old = cell.live;
    // The replacement is built BEFORE the old one is torn down. `build` runs
    // app code — `inputs`, `functions`, `onSession` — and if that throws, a
    // reset that had already disposed the old shell would leave the session
    // holding nothing at all: strictly worse than the wedged shell it was
    // called to fix. Built first, a failed reset changes nothing.
    const next = build(cell.token, cell.principal);
    const carried = [...old.connections];
    old.ended = true;
    old.connections.clear();
    old.shell.dispose();
    cell.live = next;
    for (const connection of carried) attach(next, connection);
  };

  const sessionOn = (cell: Cell, ephemeral: boolean): ShellSession => ({
    // Read through the cell, always: after a reset the shell behind this
    // session is a different object.
    get shell(): Shell {
      return cell.live.shell;
    },
    attach: (connection) => attach(cell.live, connection),
    detach: (connection) => {
      const live = cell.live;
      live.connections.delete(connection);
      if (live.connections.size > 0) return;
      live.idleSince = Date.now();
      if (!ephemeral) return;
      live.ended = true;
      live.shell.dispose();
    },
    // Transport → shell addressing: the wire tags the canvas; the canvas's
    // ACTIVE instance is the origin (only it renders interactive UI), so
    // nova's own origin filter delivers the event to that instance's
    // triggers alone. An event already carrying an origin keeps it; a
    // canvas with nothing mounted dispatches unstamped (global).
    dispatch: (canvas, event) => {
      const { shell } = cell.live;
      const active = shell.getState().canvases[canvas]?.active;
      const stamped = active !== undefined && event['origin'] === undefined ? { ...event, origin: active.id } : event;
      shell.dispatch(stamped as Parameters<Shell['dispatch']>[0]);
    },
    publish: (channel, payload) => cell.live.shell.publish(channel, payload),
    reset: () => rebuild(cell),
  });

  // ── the idle sweep ──
  // A durable shell with nothing attached for `idleMs` is disposed. Safe by
  // the same argument that makes a process restart safe (DESIGN.md § Server
  // shells, Lifetime): the
  // projection is durable, a shell is a warm cache, and the next connection
  // rebuilds it from definitions. The clock is the IDLE one — a shell somebody
  // is looking at is never collected, however old.
  const idleMs = ctx.idleMs ?? DEFAULT_IDLE_MS;

  const sweep = (): void => {
    const now = Date.now();
    for (const [principal, cell] of [...durable]) {
      const live = cell.live;
      if (live.ended) {
        durable.delete(principal);
        continue;
      }
      if (live.connections.size > 0 || live.idleSince === null) continue;
      if (now - live.idleSince < idleMs) continue;
      live.ended = true;
      live.shell.dispose();
      durable.delete(principal);
    }
  };

  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (idleMs > 0 && Number.isFinite(idleMs)) {
    sweeper = setInterval(sweep, Math.min(idleMs, SWEEP_EVERY_MS));
    // The sweep must never be the reason a process stays alive.
    (sweeper as unknown as { unref?: () => void }).unref?.();
  }

  return {
    session: (token, principal) => {
      if (principal === null) return sessionOn({ live: build(token, principal), token, principal }, true);
      const existing = durable.get(principal);
      if (existing !== undefined) {
        existing.token = token; // a rebuild should re-authorize as the newest session
        return sessionOn(existing, false);
      }
      const cell: Cell = { live: build(token, principal), token, principal };
      durable.set(principal, cell);
      return sessionOn(cell, false);
    },
    adopt: () => {
      for (const [principal, cell] of durable) {
        if (cell.live.ended) continue;
        const granted = new Set(ctx.catalog(principal).ids);
        const bindings = ctx.variants(principal);
        for (const [id, definition] of Object.entries(ctx.app.actions)) {
          if (!granted.has(id)) continue;
          const layout = bindings.get(id);
          cell.live.shell.registerAction(layout === undefined ? definition : { ...definition, layout });
        }
      }
    },
    list: () => {
      const reports: ShellReport[] = [];
      for (const [principal, cell] of durable) {
        const live = cell.live;
        if (live.ended) continue;
        try {
          // nova's own read of a running shell — top of stack first.
          const canvases = snapshotShell(live.shell)
            .canvases.filter((canvas) => canvas.items.length > 0)
            .map((canvas) => ({ id: canvas.id, actions: canvas.items.map((item) => item.definitionId) }));
          reports.push({ principal, connections: live.connections.size, since: live.since, idleSince: live.idleSince, canvases });
        } catch {
          // unreadable (disposed under us) — not a shell anybody can be shown
        }
      }
      return reports;
    },
    reset: (principal) => {
      const cell = durable.get(principal);
      if (cell === undefined || cell.live.ended) return false;
      rebuild(cell);
      return true;
    },
    stop: () => {
      if (sweeper !== undefined) clearInterval(sweeper);
      sweeper = undefined;
    },
  };
};
