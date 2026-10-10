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
    } catch {
      // unreadable (disposed under us) — not a shell anybody can be shown
    }
  }
  return reports;
};

// ASKED AGAIN, not read off the cell. Adopting happens because something
// the composition was made FROM changed, and the commonest such change is a
// tenant installing an integration — so what a shell was born holding is
// exactly the thing that must not be trusted here. Asynchronous and
// unawaited: definitions landing a tick late simply register, which is the
// same progressive path `seeds` already takes.
const adoptAll = async (host: HostParts): Promise<void> => {
  const { config, durable } = host;
  for (const [, cell] of durable) {
    if (cell.live.ended) continue;
    const made = await config.composition(cell.principal);
    for (const definition of Object.values(made.actions)) cell.live.shell.registerAction(definition);
  }
};

export const createShellHost = (config: ShellHostConfig): ShellHost => {
  const durable = new Map<string, Cell>();
  const host: HostParts = { config, emit: emitterOf(config.telemetry), kept: config.kept ?? true, delta: config.limits?.delta ?? false, durable };
  const { kept, delta } = host;

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
  const rebuild = async (cell: Cell): Promise<void> => {
    const old = cell.live;
    // The replacement is built BEFORE the old one is torn down. The build runs
    // app code — `inputs`, `functions`, `onSession` — and if that throws, a
    // reset that had already disposed the old shell would leave the session
    // holding nothing at all: strictly worse than the wedged shell it was
    // called to fix. Built first, a failed reset changes nothing.
    const next = await buildShell(host, cell.token, cell.principal, true);
    const carried = [...old.connections].map((connection) => ({ connection, wants: old.deltaReady.has(connection) }));
    old.ended = true;
    old.connections.clear();
    old.shell.dispose();
    cell.live = next;
    for (const { connection, wants } of carried) attach(next, connection, delta && wants);
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
        return sessionOn(host, { live, token, principal }, true, rebuild);
      }
      return sessionOn(host, await durableCell(token, principal), false, rebuild);
    },
    snapshot: async (token, principal, options) => {
      const waitMs = options?.waitMs ?? DEFAULT_SNAPSHOT_WAIT_MS;
      if (principal !== null && kept) {
        const cell = await durableCell(token, principal);
        const settled = await settle(cell.live, waitMs);
        return { ...read(cell.live), settled, ...needOf(cell.live, principal, kept, config.entries) };
      }
      // Nobody in particular, or a page: a shell for the length of one read.
      const seed = randomBytes(9).toString('hex');
      const live = await buildShell(host, token, principal, false, seed, options?.inputs);
      try {
        const settled = await settle(live, waitMs);
        return { ...read(live), seed, settled, ...needOf(live, principal, kept, config.entries) };
      } finally {
        live.ended = true;
        live.shell.dispose();
      }
    },
    adopt: () => void adoptAll(host).catch((err: unknown) => console.error('[moss/shells] adopt failed', err)),
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
      } catch {
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
