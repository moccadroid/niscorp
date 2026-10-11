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

// ═══════════════════════════════════════════════════════════════
// The shell host (DESIGN.md § The shell runs on the server): the shell
// runs here, the client is a canvas terminal. One durable shell per authenticated
// principal (the socket is ephemeral: connections attach and detach, the
// shell survives — reattach just re-sends current trees, and N attached
// connections receive the same frames: shared canvases are the same
// mechanism). Anonymous connections get a throwaway shell, disposed with
// the connection; so does every connection of a host that keeps none (a
// page's). Kept or not, a shell is one of the host's living shells from when
// its build lands until it ends (./host-state.ts, `living`), which is how a change
// to what the app consists of, and a reset of one principal, reach every one.
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
//
// WHAT THE HOST KEEPS (./host-state.ts), AND WHAT ORDERS IT. Every piece of
// work on a shell carries a number: a first build, a reset and a change of
// what is in force each take the next one of one counter. Work waits on the
// app's code, so what a principal holds may be answered for two changes in
// either order; a shell takes the answer with the higher number, and the
// order they arrive in decides nothing.
//   `lastNumber`      the one counter.
//   `changeNumber`    the number the latest change took. A shell that lands
//                     with a lower one adopts.
//   `Cell.number`     the number a cell's shell reflects: of its build, or of
//                     the change it last adopted.
//   `durable`         principal → the cell of the shell the host keeps for them.
//   `building`        principal → the first build of that shell while it
//                     runs, shared by whoever arrives meanwhile.
//   `living`          every living shell → its cell: what a change, a reset
//                     and a delivery walk.
//   `Cell.resetting`  the reset of a cell that is under way: the next one
//                     waits for it.
// A build is bounded (`build`), so whoever waits on one, an arrival or the
// next reset, waits for the endpoint timeout at most.
// ═══════════════════════════════════════════════════════════════

// A shell nobody has been attached to for half an hour is a warm cache with no
// reader. Rebuilding costs one derivation pass on the next connect.
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

// The sweep never runs less often than this, so a short `idleMs` is honoured
// closely and a long one doesn't cost a wakeup per minute.
const SWEEP_EVERY_MS = 60 * 1000;

// How long a build may take where the deployment names no endpoint timeout
// (`ShellLimits.endpointTimeoutMs`): the wait nova gives an endpoint call it
// was told nothing about.
const DEFAULT_BUILD_TIMEOUT_MS = 30_000;

// ── the idle sweep ──
// A durable shell with nothing attached for `idleMs` is disposed. Safe by
// the same argument that makes a process restart safe (DESIGN.md § The
// socket, Durability): the
// database is durable, a shell is a warm cache, and the next connection
// rebuilds it from definitions and rows. The clock is the IDLE one — a shell
// somebody is looking at is never collected, however old.
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

// Two documents that say the same thing: the one object, or two that
// serialize alike. A layout and a fragment are JSON (the manifest's schema
// read them), and an owner may answer a copy at each asking.
const sameDocument = (one: unknown, other: unknown): boolean => one === other || JSON.stringify(one) === JSON.stringify(other);

// THE SHELL'S OWN LAYOUTS, BROUGHT LEVEL: the frame, each `{ ref }` of the
// layout store and each fragment, of the same answer the actions are taken
// from.
//
// A build and an adopt take that answer whole (the actions, the component
// names, the entries, the frame, the layout store, the fragments): one path
// from one answer, so a layout published without a deploy reaches living
// shells as it reaches the next one built.
//
// ONLY WHAT IS ANSWERED DIFFERENTLY IS PUT IN PLACE, against what was last
// taken (`Live.layouts`). A shell's own code changes these while it runs
// (`shell.setLayout` is how somebody's own arrangement of a region is
// shown), and an adopt happens for every change to what the app consists of:
// an integration approved must not set every person's dock back to the one
// the app ships.
//
// WHAT IS NO LONGER ANSWERED STAYS. Nova has no way to take a fragment or a
// ref out of a shell, nor a frame away from one: one that left is held and
// named by nothing new. THE CANVASES ARE NOT TAKEN AGAIN EITHER: which
// canvases a shell has, and what is mounted on each, is the shell's own state
// from the moment it is built (./host-state.ts, `canvasesOf`), and what a canvas
// mounts first is derived with `inputs`, which an adopt does not run again.
// A reset does all of it afresh.
const takeLayouts = (live: Live, made: ShellComposition): void => {
  const taken = live.layouts;
  const answered = layoutsOf(made);
  for (const [ref, layout] of Object.entries(answered.layoutStore)) {
    if (!sameDocument(taken.layoutStore[ref], layout)) live.shell.setLayout(ref, layout);
  }
  for (const [id, fragment] of Object.entries(answered.fragments)) {
    // Under the name it is answered by, as a build registers it.
    if (!sameDocument(taken.fragments[id], fragment)) live.shell.registerFragment({ ...fragment, id });
  }
  if (answered.frame !== undefined && !sameDocument(taken.frame, answered.frame)) live.shell.setCanvasLayout(answered.frame);
  live.layouts = answered;
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
// it, so it is neither on screen nor pushable.
//
// EACH SHELL ADOPTS ON ITS OWN, unawaited. No shell waits for another and no
// change waits for another change, so somebody whose composition is never
// answered holds up nobody else. A SHELL THAT CANNOT ADOPT IS SAID, and keeps
// what it held: one that throws (a principal that no longer resolves) stops
// no other.
const adopt = (host: HostState, cell: Cell): void => {
  const adopting = async (): Promise<void> => {
    if (cell.live.ended) return;
    // The change this asking answers for: the latest, read before the
    // question is put, so the answer says at least what that change left.
    const number = host.changeNumber;
    const made = await host.config.composition(cell.principal);
    // Read after the answer: a reset may have put another shell in the cell
    // while it was asked for.
    const live = cell.live;
    // THE HIGHEST NUMBER IS WHAT A SHELL HOLDS. Two changes are two askings,
    // and nothing makes the first be answered first (who somebody is, is read
    // from the app, as slowly as it reads). An answer that arrives when the
    // shell already reflects its number or a higher one (a later change's
    // answer was put in place, or the shell was built since) is the older of
    // the two, and is dropped.
    if (live.ended || number <= cell.number) return;
    cell.number = number;
    // A definition that arrived may mention a component nothing mentioned
    // when the shell was built.
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

// ONE CHANGE OF WHAT IS IN FORCE, GIVEN TO EVERY LIVING SHELL OF THIS HOST,
// whoever it is for and whether it is kept: a visitor's, and everybody's on a
// host that keeps none, as well as the kept ones. The change takes the next
// number, and every shell that lives adopts.
//
// A SHELL WHOSE BUILD IS UNDER WAY IS NOT WALKED, AND NEEDS NO LIST: it was
// built from what its principal held before the change, so it lands with a
// number below the change's, and adopts then (`settleIn`).
//
// WHAT THAT COSTS: every living shell's composition is asked in the same
// moment. Who a principal is, is asked once for all the shells of that
// principal and remembered (the identity module), so a change is as many
// resolutions at once as the host has principals whose record is not held.
const adoptAll = (host: HostState): void => {
  host.lastNumber += 1;
  host.changeNumber = host.lastNumber;
  for (const cell of [...host.living.values()]) adopt(host, cell);
};

type Built = { live: Live; number: number };

// ONE BUILD: it takes the next number, and it is bounded.
//
// BOUNDED, because a build runs the app's code (who the principal is, their
// `inputs`, their words) and that code can hang for one call. A build that
// has not landed when the endpoint timeout runs out fails: whoever waited on
// it is refused then, and nothing of the host waits on it afterwards. If the
// app's code answers later, the build stops where it hears of it (./build.ts,
// `wanted`), having made no shell.
//
// `wanted`: whether the build is still one somebody waits for, beside being
// in time (a reset's is not, once the shell it would replace has ended). A
// build that stops for that reason alone answers `undefined`: nobody is
// refused, because nobody waited.
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
    // A build under way must never be the reason a process stays alive.
    timer.unref?.();
    buildShell(host, { ...asked, wanted: () => inTime && wanted() })
      .then((live) => resolve(live === undefined ? undefined : { live, number }), reject)
      .finally(() => clearTimeout(timer));
  });
};

// A build that replaces nothing is stopped by its time running out and by
// nothing else, and whoever waited on it was refused when it did.
const whole = (built: Built | undefined): Built => {
  if (built === undefined) throw new Error('moss: a build stopped without a shell, and without having run out of time.');
  return built;
};

// A SHELL THAT LANDED IN ITS CELL is one of the living from here on, and is
// brought level if what is in force changed while it was built: it was made
// from what its principal held when the build began. One that ended on the
// way (app code that signed out while its session was being built) is not put
// among the living: nothing would take it out again.
const settleIn = (host: HostState, cell: Cell): void => {
  if (cell.live.ended) return;
  host.living.set(cell.live, cell);
  if (cell.number < host.changeNumber) adopt(host, cell);
};

// A FIRST BUILD, AND THE CELL ITS SHELL IS ADDRESSED THROUGH. `keep`: the
// cell is the one this host keeps for the principal.
const open = async (host: HostState, asked: Omit<BuildRequest, 'reset' | 'wanted'>, keep: boolean): Promise<Cell> => {
  const { live, number } = whole(await build(host, { ...asked, reset: false }));
  const cell: Cell = { live, token: asked.token, principal: asked.principal, ...(asked.opening !== undefined ? { opening: asked.opening } : {}), number };
  if (keep && asked.principal !== null) host.durable.set(asked.principal, cell);
  settleIn(host, cell);
  return cell;
};

// THE CELL A HOST KEEPS FOR A PRINCIPAL, built if there is none yet.
//
// ONE BUILD FOR A PRINCIPAL AT A TIME. A build awaits (who they are, their
// inputs, their words), so two arrivals in one moment — a page's read and
// its socket, two tabs — would each find no shell and each build one. The
// second would take the first's place in the map and the first would stand
// for ever, held by whoever arrived first. So a build under way is kept by
// principal (`building`), and whoever arrives while it runs is handed its
// cell when it lands. One that fails, or runs out of time, is refused to all
// of them and keeps nothing: the next arrival builds afresh.
const keptCell = (host: HostState, token: string | null, principal: string): Promise<Cell> => {
  const { durable, building } = host;
  // a rebuild should re-authorize as the newest session
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

// Dispose a shell and stand its replacement in the same cell, carrying the
// attached connections across. Everything a shell is derived from — the
// catalog, the variants, `inputs`, `seeds` — is re-read by the build, so what
// comes back is the screen boot would have served this principal now. The
// terminals are not told anything: they receive a frame and current trees,
// the same two messages a reconnect brings.
const replaceShell = async (host: HostState, cell: Cell): Promise<void> => {
  // Signed out, swept, or left by its last terminal since the reset was
  // asked for: there is nobody to rebuild it for, and no app code is run to
  // build what would be thrown away. Asked again at each wait of the build,
  // and where it lands.
  const stands = (): boolean => !cell.live.ended;
  if (!stands()) return;
  // The replacement is built BEFORE the old one is torn down. The build runs
  // app code — `inputs`, `functions`, `onSession` — and if that throws, a
  // reset that had already disposed the old shell would leave the session
  // holding nothing at all: strictly worse than the wedged shell it was
  // called to fix. Built first, a failed reset changes nothing. It is built
  // from everything the shell was opened with: the principal, the newest
  // token, and the id seed and the inputs a page's path carried.
  const built = await build(host, { token: cell.token, principal: cell.principal, ...(cell.opening !== undefined ? { opening: cell.opening } : {}), reset: true }, stands);
  if (built === undefined) return;
  // THE SHELL THIS RESET REPLACES is the one that stands when it lands.
  const old = cell.live;
  // It ended while its replacement was built. The replacement is nobody's.
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
  // The cell's living shell is the replacement from here on. A change that
  // happened while it was built was adopted by the shell that stood, and the
  // replacement, made from what was held before it, adopts it too.
  settleIn(host, cell);
  for (const { connection, wants } of carried) attach(built.live, connection, host.delta && wants);
};

// A RESET OF ONE CELL, ASKED FOR AND NOT WAITED ON. Whoever asks is answered
// at once ("did they hold a shell" is knowable then); the replacement lands a
// tick later and every attached terminal receives a fresh frame when it does,
// exactly as `seeds` behaves. A reset that blocked its caller on a round trip
// would make a role change slower than the write that caused it. One that
// cannot build is said, and the shell that stood stays.
//
// ONE RESET OF A CELL AT A TIME, each after the one before it has landed or
// failed. Each reset that is asked for still happens, in turn: the second may
// be for a reason that arrived after the first had read what it builds from.
// A build is bounded, so a reset waits for the endpoint timeout at most.
const resetCell = (host: HostState, cell: Cell): void => {
  const turn = (cell.resetting ?? Promise.resolve()).then(() => replaceShell(host, cell));
  cell.resetting = turn.catch((error: unknown) => console.error('[moss/shells] a reset failed to rebuild', error));
};

// EVERY LIVING SHELL OF ONE PRINCIPAL: the one this host keeps for them; or,
// on a host that keeps none, the one built for each of their connections.
const shellsOf = (host: HostState, principal: string): Cell[] => {
  if (!host.kept) return [...host.living.values()].filter((cell) => cell.principal === principal);
  const cell = host.durable.get(principal);
  return cell === undefined || cell.live.ended ? [] : [cell];
};

// THE SWEEP, STARTED: on a beat for as long as the host stands. Answers how
// it is stopped.
const startSweep = (host: HostState): (() => void) => {
  const idleMs = host.config.limits?.idleMs ?? DEFAULT_IDLE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (idleMs > 0 && Number.isFinite(idleMs)) {
    sweeper = setInterval(() => sweep(host, idleMs), Math.min(idleMs, SWEEP_EVERY_MS));
    // The sweep must never be the reason a process stays alive.
    sweeper.unref?.();
  }
  return () => {
    if (sweeper !== undefined) clearInterval(sweeper);
    sweeper = undefined;
  };
};

// WHAT SOMEBODY IS LOOKING AT, READ ONCE: off the shell the host keeps for
// them, or off one built for the length of the read.
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
    // Nobody in particular, or a page: a shell for the length of one read.
    const seed = randomBytes(9).toString('hex');
    const opening = { seed, ...(options?.inputs !== undefined ? { inputs: options.inputs } : {}) };
    const { live } = whole(await build(host, { token, principal, opening, reset: false }));
    try {
      const settled = await settle(live, waitMs);
      return { ...read(live), seed, settled, ...needOf(live, principal, kept) };
    } finally {
      // Never one of the living: it is read and ended before anything
      // could ask it to adopt.
      endShell(host, live);
      live.shell.dispose();
    }
  };

// A MESSAGE, PUT TO EVERY LIVING SHELL A HOST HAS FOR SOMEBODY: the one it
// keeps for them, or, on a host that keeps none, the one built for each of
// their connections (`shellsOf`: the shells a reset of them finds).
const deliverTo =
  (host: HostState): ShellHost['deliver'] =>
  (principal, channel, payload) => {
    // Into LIVING shells only. A principal with none hears nothing and that
    // is correct — this is push over shells that already exist, never a
    // reason to build one for somebody who is not there. The rows the message
    // points at are still in the database; their screen reads them the next
    // time it opens.
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
        // Built for this session alone, and nobody's to keep: it ends when
        // its last terminal leaves. Until then it is one of the living.
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
