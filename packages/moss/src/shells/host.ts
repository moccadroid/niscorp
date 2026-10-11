import { randomBytes } from 'node:crypto';
import { snapshotShell } from '@niscorp/nova/reflect';
import { emitterOf } from '../runtime';
import { buildShell } from './build';
import type { ShellHostConfig } from './config';
import type { Cell, HostParts } from './live';
import { sessionOn } from './shell-session';
import { DEFAULT_SNAPSHOT_WAIT_MS, needOf, read, settle } from './snapshot';
import { attach } from './stream';
import type { ShellHost, ShellReport } from './types';

// ═══════════════════════════════════════════════════════════════
// The shell host (DESIGN.md § The shell runs on the server): the shell
// runs here, the client is a canvas terminal. One durable shell per authenticated
// principal (the socket is ephemeral: connections attach and detach, the
// shell survives — reattach just re-sends current trees, and N attached
// connections receive the same frames: shared canvases are the same
// mechanism). Anonymous connections get a throwaway shell, disposed with
// the connection.
//
// The shell is built from what its principal's composition says (./config.ts):
// canvases and fragments are data, and the actions they hold arrive already
// granted, with their roles' layout variant in place. `inputs` is the app's
// one derivation hook (per-principal boot input — nav flags, user chips).
// What is derived here is small: an initial the principal does not hold
// simply doesn't mount (ring 1), the ambient transform context comes from
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
// the database is the durable thing, a shell is a warm cache.
// ═══════════════════════════════════════════════════════════════

// A shell nobody has been attached to for half an hour is a warm cache with no
// reader. Rebuilding costs one derivation pass on the next connect.
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

// The sweep never runs less often than this, so a short `idleMs` is honoured
// closely and a long one doesn't cost a wakeup per minute.
const SWEEP_EVERY_MS = 60 * 1000;

// ── the idle sweep ──
// A durable shell with nothing attached for `idleMs` is disposed. Safe by
// the same argument that makes a process restart safe (DESIGN.md § The
// socket, Durability): the
// database is durable, a shell is a warm cache, and the next connection
// rebuilds it from definitions and rows. The clock is the IDLE one — a shell
// somebody is looking at is never collected, however old.
const sweep = (durable: Map<string, Cell>, idleMs: number): void => {
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

// Every durable shell alive right now, as an operator is shown it.
const rosterOf = (durable: ReadonlyMap<string, Cell>): ShellReport[] => {
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
    } catch (error) {
      // Unreadable (disposed under us): not a shell anybody can be shown. It
      // is said, because a shell missing from the roster is what an operator
      // would otherwise have to guess at.
      console.error(`[moss/shells] the shell of ${principal} could not be read for the roster, and is left off it:`, error);
    }
  }
  return reports;
};

// ONE LIVING SHELL, BROUGHT LEVEL WITH WHAT ITS PRINCIPAL HOLDS NOW.
//
// ASKED AGAIN, not read off the cell. Adopting happens because something
// the composition was made FROM changed, and the commonest such change is a
// tenant installing an integration — so what a shell was born holding is
// exactly the thing that must not be trusted here.
//
// In place: nova's registerAction adds or replaces and mounted instances keep
// their state, so nobody loses what they were in the middle of. And both
// ways. An action that is gone (an integration uninstalled, a set replaced)
// or is no longer granted is REMOVED: nova unmounts its instances and forgets
// it, so it is neither on screen nor pushable. It used to stay in every shell
// that had it, for as long as the shell lived.
const adoptInto = async (host: HostParts, cell: Cell): Promise<void> => {
  if (cell.live.ended) return;
  const made = await host.config.composition(cell.principal);
  // Read after the answer: a reset may have put another shell in the cell
  // while it was asked for.
  const live = cell.live;
  if (live.ended) return;
  // A definition that arrived may mention a component nothing mentioned
  // when the shell was built.
  for (const [name, contract] of Object.entries(made.components)) {
    if (!live.shell.registry.has(name)) live.shell.registry.register(name, contract);
  }
  for (const id of live.held) if (!Object.hasOwn(made.actions, id)) live.shell.removeAction(id);
  for (const definition of Object.values(made.actions)) live.shell.registerAction(definition);
  live.held = new Set(Object.keys(made.actions));
  live.entries = made.entries;
};

// Every living shell, and each one whose build was under way when this was
// asked: it was built from what its principal held before the change.
// Asynchronous and unawaited: definitions landing a tick late simply
// register, which is the same progressive path `seeds` already takes. One
// at a time, so a change does not resolve every principal at once.
//
// A SHELL THAT CANNOT ADOPT IS SAID, AND THE REST GO ON. One throw (a
// principal that no longer resolves) used to end the walk, and every
// principal after it kept the old application until something else changed.
const adoptAll = async (host: HostParts, underWay: readonly Promise<Cell>[]): Promise<void> => {
  const adopting = async (cell: Cell): Promise<void> => {
    try {
      await adoptInto(host, cell);
    } catch (error) {
      console.error(`[moss/shells] the shell of ${cell.principal ?? 'nobody'} could not adopt what changed, and keeps what it held:`, error);
    }
  };
  for (const cell of [...host.durable.values()]) await adopting(cell);
  for (const build of underWay) {
    // A build that fails is its caller's to hear of; there is nothing to adopt.
    const cell = await build.catch(() => undefined);
    if (cell !== undefined) await adopting(cell);
  }
};

// Dispose a shell and stand its replacement in the same cell, carrying the
// attached connections across. Everything a shell is derived from — the
// catalog, the variants, `inputs`, `seeds` — is re-read by the build, so what
// comes back is the screen boot would have served this principal now. The
// terminals are not told anything: they receive a frame and current trees,
// the same two messages a reconnect brings.
// ASYNC, and its callers deliberately do not await it. `reset` answers "did
// they hold a shell", which is knowable at once; the replacement lands a tick
// later and every attached terminal receives a fresh frame when it does —
// exactly as `seeds` already behaves. A reset that blocked its caller on a
// round trip would make a role change slower than the write that caused it.
const replaceShell = async (host: HostParts, cell: Cell): Promise<void> => {
  // Signed out, swept, or left by its last terminal since the reset was
  // asked for: there is nobody to rebuild it for.
  if (cell.live.ended) return;
  // The replacement is built BEFORE the old one is torn down. The build runs
  // app code — `inputs`, `functions`, `onSession` — and if that throws, a
  // reset that had already disposed the old shell would leave the session
  // holding nothing at all: strictly worse than the wedged shell it was
  // called to fix. Built first, a failed reset changes nothing. It is built
  // from everything the shell was opened with: the principal, the newest
  // token, and the id seed and the inputs a page's path carried.
  const next = await buildShell(host, cell.token, cell.principal, true, cell.opening?.seed, cell.opening?.inputs);
  const old = cell.live;
  // It ended while its replacement was built. The replacement is nobody's.
  if (old.ended) {
    next.ended = true;
    next.shell.dispose();
    return;
  }
  const carried = [...old.connections].map((connection) => ({ connection, wants: old.deltaReady.has(connection) }));
  old.ended = true;
  old.connections.clear();
  old.shell.dispose();
  cell.live = next;
  for (const { connection, wants } of carried) attach(next, connection, host.delta && wants);
};

export const createShellHost = (config: ShellHostConfig): ShellHost => {
  const durable = new Map<string, Cell>();
  const host: HostParts = { config, emit: emitterOf(config.telemetry), kept: config.kept ?? true, delta: config.limits?.delta ?? false, durable };
  const { kept } = host;

  // ONE RESET OF A CELL AT A TIME, each after the one before it. A reset
  // builds and then swaps, so two that overlapped each began from the shell
  // that stood then: the first to land carried the terminals to its shell and
  // the second, finding none left to carry, took the cell. The terminals were
  // left on a shell nothing addressed and nothing would dispose. Each reset
  // that was asked for still happens, in turn: the second may be for a reason
  // that arrived after the first had read what it builds from.
  const rebuild = (cell: Cell): Promise<void> => {
    const turn = (cell.resetting ?? Promise.resolve()).then(() => replaceShell(host, cell));
    // The next one waits for this one whether it lands or fails.
    cell.resetting = turn.catch(() => undefined);
    return turn;
  };

  // ONE BUILD FOR A PRINCIPAL AT A TIME. A build awaits (who they are, their
  // inputs, their words), so two arrivals in one moment — a page's read and
  // its socket, two tabs — would each find no shell and each build one. The
  // second took the first's place in the map and the first stood for ever,
  // held by whoever arrived first. So a build under way is kept by principal,
  // and whoever arrives while it runs is handed its cell when it lands. One
  // that fails is refused to all of them and keeps nothing: the next arrival
  // builds afresh.
  const building = new Map<string, Promise<Cell>>();
  const durableCell = (token: string | null, principal: string): Promise<Cell> => {
    // a rebuild should re-authorize as the newest session
    const newest = (cell: Cell): Cell => {
      cell.token = token;
      return cell;
    };
    const existing = durable.get(principal);
    if (existing !== undefined) return Promise.resolve(newest(existing));
    const underWay = building.get(principal);
    if (underWay !== undefined) return underWay.then(newest);
    const started = buildShell(host, token, principal)
      .then((live) => {
        const cell: Cell = { live, token, principal };
        durable.set(principal, cell);
        return cell;
      })
      .finally(() => building.delete(principal));
    building.set(principal, started);
    return started;
  };

  // The adopt that is under way, or the last one that ran (it never rejects).
  let adopted: Promise<void> = Promise.resolve();

  const idleMs = config.limits?.idleMs ?? DEFAULT_IDLE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (idleMs > 0 && Number.isFinite(idleMs)) {
    sweeper = setInterval(() => sweep(durable, idleMs), Math.min(idleMs, SWEEP_EVERY_MS));
    // The sweep must never be the reason a process stays alive.
    sweeper.unref?.();
  }

  return {
    session: async (token, principal, options) => {
      if (principal === null || !kept) {
        const live = await buildShell(host, token, principal, false, options?.seed, options?.inputs);
        return sessionOn(host, { live, token, principal, ...(options !== undefined ? { opening: options } : {}) }, true, rebuild);
      }
      return sessionOn(host, await durableCell(token, principal), false, rebuild);
    },
    snapshot: async (token, principal, options) => {
      const waitMs = options?.waitMs ?? DEFAULT_SNAPSHOT_WAIT_MS;
      if (principal !== null && kept) {
        const cell = await durableCell(token, principal);
        const settled = await settle(cell.live, waitMs);
        return { ...read(cell.live), settled, ...needOf(cell.live, principal, kept) };
      }
      // Nobody in particular, or a page: a shell for the length of one read.
      const seed = randomBytes(9).toString('hex');
      const live = await buildShell(host, token, principal, false, seed, options?.inputs);
      try {
        const settled = await settle(live, waitMs);
        return { ...read(live), seed, settled, ...needOf(live, principal, kept) };
      } finally {
        live.ended = true;
        live.shell.dispose();
      }
    },
    // One adopt after another: a later change is adopted after an earlier
    // one, however long each takes to be answered, so what a shell ends up
    // holding is what the last change left its principal with.
    adopt: () => {
      const underWay = [...building.values()];
      adopted = adopted.then(() => adoptAll(host, underWay));
    },
    deliver: (principal, channel, payload) => {
      // Into the LIVE shell only. A principal with no durable shell hears
      // nothing and that is correct — this is push over shells that already
      // exist, never a reason to build one for somebody who is not there. The
      // rows the message points at are still in the database; their screen
      // reads them the next time it opens.
      const cell = durable.get(principal);
      if (cell === undefined || cell.live.ended) return false;
      try {
        cell.live.shell.publish(channel, payload);
        return true;
      } catch (error) {
        console.error(`[moss/shells] a delivery on "${channel}" to the shell of ${principal} failed:`, error);
        return false;
      }
    },
    list: () => rosterOf(durable),
    reset: (principal) => {
      const cell = durable.get(principal);
      if (cell === undefined || cell.live.ended) return false;
      void rebuild(cell).catch((err: unknown) => console.error('[moss/shells] a reset failed to rebuild', err));
      return true;
    },
    stop: () => {
      if (sweeper !== undefined) clearInterval(sweeper);
      sweeper = undefined;
    },
  };
};
