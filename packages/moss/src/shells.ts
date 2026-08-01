import { createShell, createComponentRegistry, CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from '@niscorp/nova';
import { componentsOf } from '@niscorp/nova/reflect';
import type { Shell, CanvasConfig, FetchFn, LayoutNode, RenderNode } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { ScopePolicy } from '@niscorp/vex';
import type { FunctionSession, NiscApp } from './app';
import type { NiscRuntime } from './runtime';
import type { Catalog } from './principal';
import { CLOSE_SIGNED_OUT } from './socket';
import type { Connection, ServerMessage } from './socket';

// ═══════════════════════════════════════════════════════════════
// The shell host — SERVER.md §2.4: the shell runs on the server; the
// client is a canvas terminal. One durable shell per authenticated
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
};

export type ShellSession = {
  // The living nova Shell — for in-process hosts (dev checks, embedded
  // tools) that drive it directly. Remote clients ride attach/dispatch.
  shell: Shell;
  attach: (connection: Connection) => void;
  detach: (connection: Connection) => void;
  dispatch: (canvas: string, event: Record<string, unknown>) => void;
  publish: (channel: string, payload?: unknown) => void;
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
};

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
    // last frame per canvas — only changes are sent (structural diffing is
    // a later optimization inside the render message, per SERVER.md)
    sent: Map<string, string>;
    flushing: boolean;
    // set when the session ends (sign-out) — pending flush passes must not
    // render a disposed shell
    ended: boolean;
  };

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

  const durable = new Map<string, Live>(); // principal → the one living shell

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
            if (principal !== null) durable.delete(principal);
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

    const live: Live = { shell, connections: new Set(), sent: new Map(), flushing: false, ended: false };
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
        const next = frame(live, canvas.id);
        if (live.sent.get(canvas.id) === next) continue;
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

  const sessionOn = (live: Live, ephemeral: boolean): ShellSession => ({
    shell: live.shell,
    attach: (connection) => {
      live.connections.add(connection);
      // The frame first — the canvas arrangement, CanvasSlot markers the
      // terminal resolves — then every canvas's current tree. (The frame is
      // static per session today; a region hot-swap re-send is a later slice.)
      connection.send(JSON.stringify({ type: 'frame', tree: live.shell.getShellRenderTree() } satisfies ServerMessage));
      // (Re)attach re-sends current trees — no replay machinery.
      for (const canvas of shellManifest.canvases) {
        const next = frame(live, canvas.id);
        live.sent.set(canvas.id, next);
        connection.send(next);
      }
    },
    detach: (connection) => {
      live.connections.delete(connection);
      if (ephemeral && live.connections.size === 0) live.shell.dispose();
    },
    // Transport → shell addressing: the wire tags the canvas; the canvas's
    // ACTIVE instance is the origin (only it renders interactive UI), so
    // nova's own origin filter delivers the event to that instance's
    // triggers alone. An event already carrying an origin keeps it; a
    // canvas with nothing mounted dispatches unstamped (global).
    dispatch: (canvas, event) => {
      const active = live.shell.getState().canvases[canvas]?.active;
      const stamped = active !== undefined && event['origin'] === undefined ? { ...event, origin: active.id } : event;
      live.shell.dispatch(stamped as Parameters<Shell['dispatch']>[0]);
    },
    publish: (channel, payload) => live.shell.publish(channel, payload),
  });

  return {
    session: (token, principal) => {
      if (principal === null) return sessionOn(build(token, principal), true);
      const existing = durable.get(principal);
      if (existing !== undefined) return sessionOn(existing, false);
      const live = build(token, principal);
      durable.set(principal, live);
      return sessionOn(live, false);
    },
    adopt: () => {
      for (const [principal, live] of durable) {
        if (live.ended) continue;
        const granted = new Set(ctx.catalog(principal).ids);
        const bindings = ctx.variants(principal);
        for (const [id, definition] of Object.entries(ctx.app.actions)) {
          if (!granted.has(id)) continue;
          const layout = bindings.get(id);
          live.shell.registerAction(layout === undefined ? definition : { ...definition, layout });
        }
      }
    },
  };
};
