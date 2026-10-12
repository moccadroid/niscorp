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

const today = (): string => new Date().toISOString().slice(0, 10);

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
            // Not a navigation: `back` must not undo the screen somebody arrives on.
            live.shell.push(canvasId, action, input, withFragments, { history: false });
          } catch (error) {
            console.error(`[moss/shells] the seed "${action}" on canvas "${canvasId}" could not be pushed, and was skipped:`, error);
          }
        }
      }
    })
    .catch((error: unknown) => {
      console.error('[moss/shells] the seeds of a shell could not be derived, and none was pushed:', error);
    });
};

export type BuildRequest = {
  token: string | null;
  principal: string | null;
  opening?: ShellOpening;
  reset: boolean;
  wanted: () => boolean;
};

export const buildShell = async (host: HostState, asked: BuildRequest): Promise<Live | undefined> => {
  const { config, emit, kept, delta } = host;
  const { hooks } = config;
  const { token, principal, opening, reset, wanted } = asked;
  const buildClock = emit === undefined ? undefined : spanClock();
  const made = await config.composition(principal);
  if (!wanted()) return undefined;
  const ids = Object.keys(made.actions);
  const granted = new Set(ids);
  const inputs = (await hooks.inputs?.({ principal, actions: ids, roles: made.roles, identity: made.scope, wire: config.wire(token) })) ?? {};
  if (!wanted()) return undefined;
  const canvases = mountedCanvases(made.canvases, granted, inputs, opening?.inputs);

  const wire = config.wrapWire === undefined ? config.wire(token) : config.wrapWire(config.wire(token));
  const userId = principal ?? 'anonymous';

  const registry = createComponentRegistry();
  for (const [name, contract] of Object.entries(made.components)) registry.register(name, contract);

  const shellRef: ShellRef = {};
  const session = functionSessionFor(host, { principal, roles: made.roles, scope: made.scope, actions: ids }, wire, shellRef);

  const phrases = (await hooks.phrases?.({ principal, identity: made.scope, wire: config.wire(token) })) ?? {};
  if (!wanted()) return undefined;

  // No await between here and `shellRef.shell = shell`: app code defers its
  // first touch of `session.shell` by a microtask, which has to find the shell
  // there and still land before the shell's mount calls answer.
  const rawFunctions = hooks.functions?.(session) ?? {};
  const functions = emit === undefined ? rawFunctions : instrumentFunctions(rawFunctions, emit, principal);
  if (kept) hooks.onSession?.(session);

  const layoutStore = createLayoutStore();
  for (const [refId, node] of Object.entries(made.layoutStore ?? {})) layoutStore.set(refId, node);

  // Two builds from one seed mint the same instance ids: the shell a document
  // was rendered from, and the one the socket builds a moment later for the
  // same visitor.
  let minted = 0;
  const idSeed = opening?.seed;
  const shell = createShell({
    registry,
    canvases,
    layoutStore,
    ...(idSeed === undefined ? {} : { instanceIdFn: () => `act-${idSeed}-${(minted += 1)}` }),
    ...(made.frame !== undefined ? { canvasLayout: made.frame } : {}),
    actions: { ...made.actions },
    ...(made.fragments !== undefined ? { fragments: { ...made.fragments } } : {}),
    transform: (config, source) =>
      evaluate(config, source !== null && typeof source === 'object' && !Array.isArray(source) ? { ...source, userId, today: today() } : source),
    fetch: wire,
    functions,
    ...(config.limits?.endpointTimeoutMs === undefined ? {} : { endpointTimeoutMs: config.limits.endpointTimeoutMs }),
    // An empty book is withheld: nova runs its phrase pass whenever one is given.
    ...(Object.keys(phrases).length === 0 ? {} : { phrases }),
    ...(config.phraseKeys === undefined ? {} : { phraseKeys: config.phraseKeys }),
  });
  const sessionShell = sessionShellOf(shell);
  shellRef.shell = shell;
  shellRef.sessionShell = sessionShell;

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

  if (emit !== undefined && buildClock !== undefined) {
    emit({ name: 'shell.build', startUnixNano: buildClock.startUnixNano, endUnixNano: buildClock.endUnixNano(), status: 'ok', attributes: { reset, hasPrincipal: principal !== null } });
  }

  return live;
};
