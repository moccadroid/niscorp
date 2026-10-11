import { createComponentRegistry, createLayoutStore, createShell } from '@niscorp/nova';
import type { CanvasConfig } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { CanvasSeed, ShellCanvas } from '../manifest';
import { spanClock } from '../runtime';
import { functionSessionFor, instrumentFunctions } from './function-session';
import type { ShellRef } from './function-session';
import { layoutsOf } from './host-state';
import type { HostState, Live } from './host-state';
import { follow } from './stream';
import type { ShellOpening } from './types';
import { sessionShellOf } from './whole-shell';

// THE BUILD OF ONE SHELL: who it is for, what mounts on its canvases, the
// session its app code is handed, the words it wears, the shell itself, and
// what is pushed onto it once it stands.

const today = (): string => new Date().toISOString().slice(0, 10);

// Canvases are data; mounting is derivation: of the declared seed (or
// CANDIDATE list) the first action the principal holds mounts — none
// held, nothing mounts. Per-principal inputs merge over the static seed.
const mountedCanvases = (
  declared: readonly ShellCanvas[],
  granted: ReadonlySet<string>,
  inputs: Record<string, Record<string, unknown>>,
  given: ShellOpening['inputs'],
): CanvasConfig[] =>
  declared.map((canvas) => {
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
    return {
      ...canvas,
      initial: { action, input: { ...staticInput, ...(inputs[canvas.id] ?? {}), ...(given?.[canvas.id] ?? {}) }, ...(withFragments !== undefined ? { with: withFragments } : {}) },
    };
  });

// Per-principal canvas SEEDING — the instance twin of `inputs`. The app
// derives which actions to push where (usually from resolved rows over
// the session's own wire), moss pushes them in order: ring 1 filters
// exactly as `initial` does, an unknown action or canvas skips rather
// than kills the session, and seeds landing after attach simply render —
// the same progressive path every later push takes.
const seedCanvases = (
  live: Live,
  declaredSeeds: Promise<Record<string, CanvasSeed[]>> | Record<string, CanvasSeed[]> | undefined,
  granted: ReadonlySet<string>,
): void => {
  if (declaredSeeds === undefined) return;
  live.seeded = Promise.resolve(declaredSeeds)
    .then((byCanvas) => {
      if (live.ended) return;
      for (const [canvasId, seeds] of Object.entries(byCanvas ?? {})) {
        for (const seed of seeds) {
          const action = typeof seed === 'string' ? seed : seed.action;
          if (!granted.has(action)) continue;
          const input = typeof seed === 'string' ? undefined : seed.input;
          const withFragments = typeof seed === 'string' ? undefined : seed.with;
          try {
            // NOT A NAVIGATION. A seed is the screen this principal arrives
            // on, derived a tick late because it had to be read; `back`
            // undoing it would empty the canvas somebody just landed on.
            live.shell.push(canvasId, action, input, withFragments, { history: false });
          } catch (error) {
            // A seed that cannot be pushed (a fragment the shell does not
            // have, an input its action refuses) is a skipped seed, not a
            // dead session. It is said: the screen is missing a card.
            console.error(`[moss/shells] the seed "${action}" on canvas "${canvasId}" could not be pushed, and was skipped:`, error);
          }
        }
      }
    })
    .catch((error: unknown) => {
      // A failed derivation seeds nothing — the canvas stays as it was and
      // the rest of the shell is untouched. It is said: the app's own hook
      // threw, and nothing else would tell anybody.
      console.error('[moss/shells] the seeds of a shell could not be derived, and none was pushed:', error);
    });
};

// WHAT ONE BUILD IS ASKED FOR: who the shell is for, and how it is opened.
export type BuildRequest = {
  token: string | null;
  principal: string | null;
  // The id seed, and the inputs a page's path carries (`ShellOpening`).
  opening?: ShellOpening;
  // This build replaces a shell that stood (the span says so).
  reset: boolean;
  // WHETHER ANYBODY STILL WAITS FOR THIS BUILD. A build waits on the app's
  // code three times (who the principal is, their `inputs`, their words), and
  // each wait may be as long as that code takes. It asks after each one. A
  // build nobody waits for any more stops there: it runs none of the app's
  // code that comes after, makes no shell, and answers `undefined`.
  wanted: () => boolean;
};

export const buildShell = async (host: HostState, asked: BuildRequest): Promise<Live | undefined> => {
  const { config, emit, kept, delta } = host;
  const { hooks } = config;
  const { token, principal, opening, reset, wanted } = asked;
  const buildClock = emit === undefined ? undefined : spanClock();
  // ONE answer for everything a shell is made of. Which actions this
  // principal is granted, and which layout their roles hold of each, was
  // decided where it was answered: what is in `made.actions` is what exists.
  const made = await config.composition(principal);
  if (!wanted()) return undefined;
  const ids = Object.keys(made.actions);
  const granted = new Set(ids);
  // ASYNC AND WIRE-BEARING, matching `seeds`: a hook that can await the
  // governed wire can ask a question about rows.
  const inputs = (await hooks.inputs?.({ principal, actions: ids, roles: made.roles, identity: made.scope, wire: config.wire(token) })) ?? {};
  if (!wanted()) return undefined;
  const canvases = mountedCanvases(made.canvases, granted, inputs, opening?.inputs);

  const wire = config.wrapWire === undefined ? config.wire(token) : config.wrapWire(config.wire(token));
  const userId = principal ?? 'anonymous';

  // nova's registry holds opaque components, so the server registers each
  // name with its contract and nothing to draw: the render pipeline validates
  // names and serializes trees, and the components live in the terminal.
  const registry = createComponentRegistry();
  for (const [name, contract] of Object.entries(made.components)) registry.register(name, contract);

  const shellRef: ShellRef = {};
  const session = functionSessionFor(host, { principal, roles: made.roles, scope: made.scope, actions: ids }, wire, shellRef);

  // THE WORDS THIS SHELL WEARS, resolved before it exists — because they are
  // a property of the shell, not of the frames it emits. Nova's renderer
  // applies them where a RenderNode is minted, so moss hands the book over
  // once and never touches a tree again.
  //
  // Resolved with the rest of the per-principal derivation. A principal whose
  // language changes gets a `rebuild`, which re-reads this alongside their
  // catalog and inputs — one path, so a language can never be a release
  // behind the screen it is painting.
  const phrases = (await hooks.phrases?.({ principal, identity: made.scope, wire: config.wire(token) })) ?? {};
  if (!wanted()) return undefined;

  // NOTHING AWAITS BETWEEN THESE SEAMS AND `shellRef.shell = shell`. Both run
  // before the shell exists, so app code defers its first touch of
  // `session.shell` — and the cheapest deferral, a microtask, has to be
  // enough: it is the only one that lands before the shell's mount calls
  // answer, so it is the only one an observer (`shell.onEndpoint`) can use
  // without missing them. Every await of this build belongs above this line
  // or below the shell.
  //
  // Endpoints first, then the non-endpoints. Both get the same session; only
  // the first produces handlers. Wrapped for telemetry when a sink is present
  // — one `fn.call` span per invocation, transparently to the handler.
  const rawFunctions = hooks.functions?.(session) ?? {};
  const functions = emit === undefined ? rawFunctions : instrumentFunctions(rawFunctions, emit, principal);
  // Session code is the app's: it rides the shell that is kept. A page's shell
  // lives for one read or one connection and runs none.
  if (kept) hooks.onSession?.(session);

  // THE FRAME'S LAYOUT STORE, seeded from the manifest so a `{ ref }` in the
  // frame resolves at the FIRST render — before any `setLayout`. A malformed
  // seed throws here (store.set validates), failing this build closed and
  // named, exactly as a bad definition does; the socket refuses this terminal
  // and the process stays up.
  const layoutStore = createLayoutStore();
  for (const [refId, node] of Object.entries(made.layoutStore ?? {})) layoutStore.set(refId, node);

  // A SEEDED shell mints its instance ids in order under the seed, so two
  // builds from one seed name their instances alike: the shell a document was
  // rendered from, and the throwaway one the socket builds a moment later for
  // the same anonymous visitor. The seed is random per document, so ids stay
  // unguessable and a stale origin from another shell still names nothing.
  let minted = 0;
  const idSeed = opening?.seed;
  const shell = createShell({
    registry,
    canvases,
    layoutStore,
    ...(idSeed === undefined ? {} : { instanceIdFn: () => `act-${idSeed}-${(minted += 1)}` }),
    ...(made.frame !== undefined ? { canvasLayout: made.frame } : {}),
    // Ring 1 and ring 2 are in what was answered: an ungranted action is not
    // among these, and a granted one carries the layout variant its holder's
    // roles hold. So everything downstream (render, serialize, the wire) is
    // already per-principal.
    actions: { ...made.actions },
    ...(made.fragments !== undefined ? { fragments: { ...made.fragments } } : {}),
    // The same seam the client shell has: prism evaluates endpoint
    // request/response transforms; `$.userId` and `$.today` are ambient,
    // never authorable by a request. The config is the action's own object
    // on every call, so evaluate checks it once (the source is new each time).
    transform: (config, source) =>
      evaluate(config, source !== null && typeof source === 'object' && !Array.isArray(source) ? { ...source, userId, today: today() } : source),
    fetch: wire,
    functions,
    ...(config.limits?.endpointTimeoutMs === undefined ? {} : { endpointTimeoutMs: config.limits.endpointTimeoutMs }),
    // An EMPTY book is withheld rather than passed: the pass is active when
    // either of these is present, and an app that does no i18n at all should
    // not pay a matcher per render for a dictionary with nothing in it.
    // `phraseKeys` alone is the source language, which still fills counted
    // phrases — the one job that survives having nothing to translate.
    ...(Object.keys(phrases).length === 0 ? {} : { phrases }),
    ...(config.phraseKeys === undefined ? {} : { phraseKeys: config.phraseKeys }),
  });
  const sessionShell = sessionShellOf(shell);
  shellRef.shell = shell;
  shellRef.sessionShell = sessionShell;

  // Born idle: a shell exists before anything attaches to it, and a shell
  // nothing ever attaches to is exactly what the sweep should collect.
  const live: Live = {
    shell,
    sessionShell,
    held: granted,
    entries: made.entries,
    layouts: layoutsOf(made),
    connections: new Set(),
    sent: new Map(),
    deltaReady: new Set(),
    flushing: false,
    ended: false,
    since: Date.now(),
    idleSince: Date.now(),
    seeded: Promise.resolve(),
  };
  shellRef.live = live;

  seedCanvases(live, hooks.seeds?.({ principal, actions: ids, roles: made.roles, wire }), granted);
  follow(live, delta);

  // `reset` distinguishes a recovery rebuild from a first build; residency and
  // eviction counts come from the identity/shell meters, not from here.
  if (emit !== undefined && buildClock !== undefined) {
    emit({ name: 'shell.build', startUnixNano: buildClock.startUnixNano, endUnixNano: buildClock.endUnixNano(), status: 'ok', attributes: { reset, hasPrincipal: principal !== null } });
  }

  return live;
};
