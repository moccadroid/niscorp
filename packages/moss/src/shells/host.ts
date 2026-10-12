import { randomBytes } from 'node:crypto';
import { snapshotShell } from '@niscorp/nova/reflect';
import { emitterOf } from '../runtime';
import { buildShell } from './build';
import type { BuildRequest } from './build';
import type { ShellComposition, ShellHostConfig } from './config';
import { endShell, layoutsOf } from './host-state';
import type { Cell, HostState, Live } from './host-state';
import { sessionOn } from './shell-session';
import { DEFAULT_SNAPSHOT_WAIT_MS, needOf, read, settle } from './snapshot';
import { attach } from './stream';
import type { OwnedShellHost, ShellHost, ShellReport } from './types';

export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

const SWEEP_EVERY_MS = 60 * 1000;

const DEFAULT_BUILD_TIMEOUT_MS = 30_000;

const sweep = (host: HostState, idleMs: number): void => {
  const { durable } = host;
  const now = Date.now();
  for (const [principal, cell] of [...durable]) {
    const live = cell.live;
    if (live.ended) {
      durable.delete(principal);
      continue;
    }
    if (live.connections.size > 0 || live.idleSince === null) continue;
    if (now - live.idleSince < idleMs) continue;
    endShell(host, live);
    live.shell.dispose();
    durable.delete(principal);
  }
};

const rosterOf = (durable: ReadonlyMap<string, Cell>): ShellReport[] => {
  const reports: ShellReport[] = [];
  for (const [principal, cell] of durable) {
    const live = cell.live;
    if (live.ended) continue;
    try {
      const canvases = snapshotShell(live.shell)
        .canvases.filter((canvas) => canvas.items.length > 0)
        .map((canvas) => ({ id: canvas.id, actions: canvas.items.map((item) => item.definitionId) }));
      reports.push({ principal, connections: live.connections.size, since: live.since, idleSince: live.idleSince, canvases });
    } catch (error) {
      console.error(`[moss/shells] the shell of ${principal} could not be read for the roster, and is left off it:`, error);
    }
  }
  return reports;
};

const sameDocument = (one: unknown, other: unknown): boolean => one === other || JSON.stringify(one) === JSON.stringify(other);

// Only what is answered differently than last time is set: a shell's own code
// changes these while it runs (`shell.setLayout`), and an adopt must not undo
// that. Nova cannot remove a fragment, a ref or a frame: one that left stays.
const takeLayouts = (live: Live, made: ShellComposition): void => {
  const taken = live.layouts;
  const answered = layoutsOf(made);
  for (const [ref, layout] of Object.entries(answered.layoutStore)) {
    if (!sameDocument(taken.layoutStore[ref], layout)) live.shell.setLayout(ref, layout);
  }
  for (const [id, fragment] of Object.entries(answered.fragments)) {
    if (!sameDocument(taken.fragments[id], fragment)) live.shell.registerFragment({ ...fragment, id });
  }
  if (answered.frame !== undefined && !sameDocument(taken.frame, answered.frame)) live.shell.setCanvasLayout(answered.frame);
  live.layouts = answered;
};

const adopt = (host: HostState, cell: Cell): void => {
  const adopting = async (): Promise<void> => {
    if (cell.live.ended) return;
    // Read before the await, so the answer reflects at least this change.
    const number = host.changeNumber;
    const made = await host.config.composition(cell.principal);
    // Read after the await: a reset may have replaced the cell's shell meanwhile.
    const live = cell.live;
    // Two changes are answered by app code in either order. An answer for a
    // number the shell already reflects is the older one, and is dropped.
    if (live.ended || number <= cell.number) return;
    cell.number = number;
    for (const [name, contract] of Object.entries(made.components)) {
      if (!live.shell.registry.has(name)) live.shell.registry.register(name, contract);
    }
    for (const id of live.held) if (!Object.hasOwn(made.actions, id)) live.shell.removeAction(id);
    for (const definition of Object.values(made.actions)) live.shell.registerAction(definition);
    live.held = new Set(Object.keys(made.actions));
    live.entries = made.entries;
    takeLayouts(live, made);
  };
  adopting().catch((error: unknown) => {
    console.error(`[moss/shells] the shell of ${cell.principal ?? 'nobody'} could not adopt what changed, and keeps what it held:`, error);
  });
};

// A shell whose build is under way is not walked: it lands with a number
// below the change's, and adopts then (`settleIn`).
const adoptAll = (host: HostState): void => {
  host.lastNumber += 1;
  host.changeNumber = host.lastNumber;
  for (const cell of [...host.living.values()]) adopt(host, cell);
};

type Built = { live: Live; number: number };

// Bounded, because a build runs app code, which can hang: past the limit
// whoever waited is refused. `undefined`: it stopped because nobody wanted it
// any more (`wanted`), and nobody is refused.
const build = (host: HostState, asked: Omit<BuildRequest, 'wanted'>, wanted: () => boolean = () => true): Promise<Built | undefined> => {
  host.lastNumber += 1;
  const number = host.lastNumber;
  const limit = host.config.limits?.endpointTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let inTime = true;
    const timer = setTimeout(() => {
      inTime = false;
      reject(new Error(`moss: the shell of ${asked.principal ?? 'nobody'} was not built within ${limit}ms.`));
    }, limit);
    timer.unref?.();
    buildShell(host, { ...asked, wanted: () => inTime && wanted() })
      .then((live) => resolve(live === undefined ? undefined : { live, number }), reject)
      .finally(() => clearTimeout(timer));
  });
};

const whole = (built: Built | undefined): Built => {
  if (built === undefined) throw new Error('moss: a build stopped without a shell, and without having run out of time.');
  return built;
};

// A shell that ended while it was built (app code signed out) is not added:
// nothing would take it out of `living` again.
const settleIn = (host: HostState, cell: Cell): void => {
  if (cell.live.ended) return;
  host.living.set(cell.live, cell);
  if (cell.number < host.changeNumber) adopt(host, cell);
};

const open = async (host: HostState, asked: Omit<BuildRequest, 'reset' | 'wanted'>, keep: boolean): Promise<Cell> => {
  const { live, number } = whole(await build(host, { ...asked, reset: false }));
  const cell: Cell = { live, token: asked.token, principal: asked.principal, ...(asked.opening !== undefined ? { opening: asked.opening } : {}), number };
  if (keep && asked.principal !== null) host.durable.set(asked.principal, cell);
  settleIn(host, cell);
  return cell;
};

// A build awaits, so two arrivals at once (a page's read and its socket) would
// each build a shell: a build under way is shared through `building`.
const keptCell = (host: HostState, token: string | null, principal: string): Promise<Cell> => {
  const { durable, building } = host;
  // A rebuild authorizes as the newest session.
  const newest = (cell: Cell): Cell => {
    cell.token = token;
    return cell;
  };
  const existing = durable.get(principal);
  if (existing !== undefined) return Promise.resolve(newest(existing));
  const arriving = building.get(principal);
  if (arriving !== undefined) return arriving.then(newest);
  const started = open(host, { token, principal }, true).finally(() => building.delete(principal));
  building.set(principal, started);
  return started;
};

const replaceShell = async (host: HostState, cell: Cell): Promise<void> => {
  const stands = (): boolean => !cell.live.ended;
  if (!stands()) return;
  // Built before the old shell is disposed: the build runs app code, and a
  // throw after the disposal would leave the session holding nothing.
  const built = await build(host, { token: cell.token, principal: cell.principal, ...(cell.opening !== undefined ? { opening: cell.opening } : {}), reset: true }, stands);
  if (built === undefined) return;
  const old = cell.live;
  if (!stands()) {
    endShell(host, built.live);
    built.live.shell.dispose();
    return;
  }
  const carried = [...old.connections].map((connection) => ({ connection, wants: old.deltaReady.has(connection) }));
  endShell(host, old);
  old.connections.clear();
  old.shell.dispose();
  cell.live = built.live;
  cell.number = built.number;
  settleIn(host, cell);
  for (const { connection, wants } of carried) attach(built.live, connection, host.delta && wants);
};

// Resets of a cell run in turn and are never merged: a later one may be for a
// change the build of the earlier one had already read past.
const resetCell = (host: HostState, cell: Cell): void => {
  const turn = (cell.resetting ?? Promise.resolve()).then(() => replaceShell(host, cell));
  cell.resetting = turn.catch((error: unknown) => console.error('[moss/shells] a reset failed to rebuild', error));
};

const shellsOf = (host: HostState, principal: string): Cell[] => {
  if (!host.kept) return [...host.living.values()].filter((cell) => cell.principal === principal);
  const cell = host.durable.get(principal);
  return cell === undefined || cell.live.ended ? [] : [cell];
};

const startSweep = (host: HostState): (() => void) => {
  const idleMs = host.config.limits?.idleMs ?? DEFAULT_IDLE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (idleMs > 0 && Number.isFinite(idleMs)) {
    sweeper = setInterval(() => sweep(host, idleMs), Math.min(idleMs, SWEEP_EVERY_MS));
    sweeper.unref?.();
  }
  return () => {
    if (sweeper !== undefined) clearInterval(sweeper);
    sweeper = undefined;
  };
};

const snapshotOf =
  (host: HostState): ShellHost['snapshot'] =>
  async (token, principal, options) => {
    const { kept } = host;
    const waitMs = options?.waitMs ?? DEFAULT_SNAPSHOT_WAIT_MS;
    if (principal !== null && kept) {
      const cell = await keptCell(host, token, principal);
      const settled = await settle(cell.live, waitMs);
      return { ...read(cell.live), settled, ...needOf(cell.live, principal, kept) };
    }
    const seed = randomBytes(9).toString('hex');
    const opening = { seed, ...(options?.inputs !== undefined ? { inputs: options.inputs } : {}) };
    const { live } = whole(await build(host, { token, principal, opening, reset: false }));
    try {
      const settled = await settle(live, waitMs);
      return { ...read(live), seed, settled, ...needOf(live, principal, kept) };
    } finally {
      endShell(host, live);
      live.shell.dispose();
    }
  };

const deliverTo =
  (host: HostState): ShellHost['deliver'] =>
  (principal, channel, payload) => {
    const took = shellsOf(host, principal).map((cell) => {
      try {
        cell.live.shell.publish(channel, payload);
        return true;
      } catch (error) {
        console.error(`[moss/shells] a delivery on "${channel}" to the shell of ${principal} failed:`, error);
        return false;
      }
    });
    return took.includes(true);
  };

export const createShellHost = (config: ShellHostConfig): OwnedShellHost => {
  const host: HostState = {
    config,
    emit: emitterOf(config.telemetry),
    kept: config.kept ?? true,
    delta: config.limits?.delta ?? false,
    durable: new Map(),
    building: new Map(),
    living: new Map(),
    lastNumber: 0,
    changeNumber: 0,
  };
  const reset = (cell: Cell): void => resetCell(host, cell);

  const handedOut: ShellHost = {
    session: async (token, principal, options) => {
      if (principal === null || !host.kept) {
        return sessionOn(host, await open(host, { token, principal, ...(options !== undefined ? { opening: options } : {}) }, false), true, reset);
      }
      return sessionOn(host, await keptCell(host, token, principal), false, reset);
    },
    snapshot: snapshotOf(host),
    deliver: deliverTo(host),
    list: () => rosterOf(host.durable),
    reset: (principal) => {
      const theirs = shellsOf(host, principal);
      for (const cell of theirs) reset(cell);
      return theirs.length > 0;
    },
  };
  return { host: handedOut, adopt: () => adoptAll(host), stop: startSweep(host) };
};
