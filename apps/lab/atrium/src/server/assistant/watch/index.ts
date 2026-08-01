import type { Shell } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { userById } from '@atrium/server/users';
import { definitionsNow } from '../knowledge';
import { assistantSession } from '../session';
import { WATCHED, fingerprintOf, changesBetween, navigatedBetween, type Fingerprint, type Authored } from './screen-diff';
import { createLedger, ASSISTANT } from '../contract';
import { runWatch, showThinking } from './run';
import type { Trigger } from './prompt';
import { meter } from '../runs';

// When to look. Attention is decided here and nowhere else, so no action can
// grant or withhold it.
//
// The only input is nova's telemetry, reduced to a fingerprint of the person's
// half of the screen. Anything that never reaches their screen is invisible: the
// app has no cross-session push, and this does not pretend otherwise.
//
//   warming   the shift is starting and `seeds` is composing the screen card by
//             card. Every settle re-baselines rather than reacting.
//   idle      a change fires at once.
//   running   one run at a time. Changes arriving now are remembered — and if
//             one of them is the clerk NAVIGATING, the run is cancelled, because
//             what it is composing is about a screen they have left.
//   cooling   the gap after a run, in which what arrived during it is delivered
//             as one follow-up look. The only delay, and it is between runs.
//
// Three brakes stop it reacting to itself, none of them a prompt line: an open
// or a close of a card the assistant owns is not a gesture; keys an endpoint or
// a lifecycle step writes are excluded, so a surface re-reading itself is not
// one either; and one run at a time.
//
// The first brake is deliberately narrow. Ownership decides whether a PLACEMENT
// counts, never whether a card is visible: excluding the assistant's cards
// outright would also hide the clerk completing one, which is the gesture this
// feature exists to follow.

type Phase = 'warming' | 'idle' | 'running' | 'cooling';

// The audiences whose shells get a watcher — the desk first, by decision.
// Everything below is audience-blind: the action set, the ceiling and the
// composition all come from the caller's resolution. Exported for the dock,
// whose `nudge` button exists only where there is a watcher to wake.
export const WATCHED_AUDIENCES: readonly string[] = ['desk'];

// Environment-overridable: a check needs faster dials than a shift does, and one
// that redefined them would be asserting on something other than the shipped gate.
const dial = (name: string, fallback: number): number => {
  const raw = Number(process.env[name] ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export type WatchAttach = {
  session: FunctionSession;
  post: (path: string, body: unknown) => Promise<unknown>;
  appendTurn: (role: string, body: string, origin: 'chat' | 'watch') => Promise<unknown>;
};

// One watcher per principal. A re-login builds a new shell, so the stale watcher
// is disposed rather than left subscribed to a shell nobody is looking at.
//
// `kick` is the dock's button. It reaches the same gate rather than starting a
// run of its own, so a press and a wake cannot both be running at once.
type Living = { dispose: () => void; kick: () => void };
const living = new Map<string, Living>();

export const watching = (): readonly string[] => [...living.keys()];

export const stopWatching = (principal?: string): void => {
  if (principal === undefined) {
    for (const entry of [...living.values()]) entry.dispose();
    return;
  }
  living.get(principal)?.dispose();
};

// The user pressed the button in the dock. Answers whether a run was started:
// false means nobody is watching this principal, which is the `authored`
// profile, and the caller can say so instead of leaving the button dead.
export const kickWatch = (principal: string): boolean => {
  const entry = living.get(principal);
  if (entry === undefined) return false;
  entry.kick();
  return true;
};

export const attachWatch = (attach: WatchAttach): void => {
  const principal = attach.session.principal;
  if (principal === null) return;
  const user = userById(principal);
  if (user === undefined || !WATCHED_AUDIENCES.includes(user.audience)) return;

  living.get(principal)?.dispose();

  // `session.shell` is a lazy getter that throws until the build finishes, and
  // this runs mid-build. Everything starts on the next tick.
  setTimeout(() => {
    let shell: Shell;
    try {
      shell = attach.session.shell;
    } catch {
      return; // the build never completed; there is nothing to watch
    }
    void begin(attach, principal, shell, user.audience, user.propertyId).catch(() => undefined);
  }, 0);
};

const begin = async (attach: WatchAttach, principal: string, shell: Shell, audience: string, propertyId: string): Promise<void> => {
  const io = assistantSession(attach.session);

  // A person who turned the assistant off gets no watcher at all: no wake, no
  // prompt, no model call. The dock still answers, because they asked.
  const profile = await io.profile();
  if (!profile.watches) return;

  start(attach, principal, shell, { audience, propertyId, io });
};

const start = (
  attach: WatchAttach,
  principal: string,
  shell: Shell,
  who: { audience: string; propertyId: string; io: ReturnType<typeof assistantSession> },
): void => {
  const coolMs = dial('WATCH_QUIET_MS', 1200);
  const warmMs = dial('WATCH_WARMUP_MS', 1500);
  const warmUntil = Date.now() + warmMs;


  const ledger = createLedger();
  const screenNow = (): Fingerprint => fingerprintOf(shell, definitionsNow(), (id) => shell.originOf(id) === ASSISTANT);

  let phase: Phase = 'warming';
  let baseline = screenNow();
  let pending = false;
  const failures: string[] = [];

  // The run in flight, and the screen it is being composed against, so the gate
  // can revoke a run whose premise has left. The model reads a screen, thinks
  // for some seconds, and by then the clerk may be on a different guest — the
  // answer is not late, it is about the wrong person.
  let inflight: AbortController | undefined;
  let composedFor: Fingerprint | undefined;

  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const off: (() => void)[] = [];

  // Every timer, so none outlives the watcher. Declared before anything that can
  // call dispose: a ReferenceError inside a timer ends the process.
  const later = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const handle = setTimeout(() => {
      timers.delete(handle);
      fn();
    }, ms);
    timers.add(handle);
    return handle;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    // A watcher torn down mid-run (sign-out, re-login, dev reload) leaves a run
    // composing an answer for a shell nobody is looking at. Same revocation, a
    // blunter cause.
    inflight?.abort();
    inflight = undefined;
    for (const stop of off) stop();
    off.length = 0;
    for (const handle of timers) clearTimeout(handle);
    timers.clear();
    settleTimer = undefined;

    living.delete(principal);
  };

  // Every entry point below is a timer or a subscription callback: no request to
  // fail, no caller to catch, and a throw would end the server. An unreadable
  // shell (signed out, revoked, dev reload) is the ordinary cause; stop watching.
  const guarded = (fn: () => void): void => {
    try {
      fn();
    } catch {
      dispose();
    }
  };

  const changesNow = (against: Fingerprint, current: Fingerprint): string[] => [...changesBetween(against, current), ...failures];

  const adopt = (): void => {
    baseline = screenNow();
    failures.length = 0;
  };

  const consider = (): void => {
    if (disposed) return;
    if (phase === 'warming') {
      if (Date.now() < warmUntil) {
        adopt();
        return;
      }
      phase = 'idle';
    }
    if (phase !== 'idle') {
      pending = true;
      // Cancel in flight. Narrow on purpose: only a card of THEIRS opening or
      // closing counts, never a value moving inside one. A clerk typing into a
      // reply box writes a key per keystroke, and cancelling on that would mean
      // the person who is busiest is the one who never gets an answer.
      if (phase === 'running' && composedFor !== undefined && navigatedBetween(composedFor, screenNow())) inflight?.abort();
      return;
    }
    if (changesNow(baseline, screenNow()).length === 0) return;
    void fire().catch(() => dispose());
  };

  // One settled look per burst: a single click writes several keys and may fire a
  // load, and a zero-delay coalesce collapses that into one decision.
  const nudge = (): void => {
    if (disposed || settleTimer !== undefined) return;
    settleTimer = later(() => {
      guarded(() => {
        settleTimer = undefined;
        if (disposed) return;
        ledger.sweep(shell);
        consider();
      });
    }, 0);
  };

  // `asked` is the user pressing the button in the dock. Two rules do not apply
  // to it: it runs with no changes to react to, because the screen standing
  // still is exactly when the user reaches for it, and it cannot be answered by
  // leaving the screen alone.
  const fire = async (asked = false): Promise<void> => {
    const atRunStart = screenNow();
    const changes = changesNow(baseline, atRunStart);
    failures.length = 0;
    if (changes.length === 0 && !asked) {
      baseline = atRunStart;
      return;
    }
    const trigger: Trigger = asked ? { kind: 'asked' } : { kind: 'changed', changes };

    phase = 'running';
    const controller = new AbortController();
    inflight = controller;
    composedFor = atRunStart;
    // Whether this run was revoked rather than finished — read in `finally`,
    // where the result is already gone.
    let revoked = false;
    controller.signal.addEventListener('abort', () => {
      revoked = true;
    });
    // Lit at the decision, not at the request: profile, actions and prompt all
    // resolve before the model is reached.
    showThinking(shell, true, 0);
    // What the run did to the clerk's own cards — what it typed into them and
    // what it took down. Both are watched by design, so without subtracting them
    // the assistant's work is indistinguishable from theirs and every answer
    // schedules another run about a gesture nobody made.
    let authored: Authored = { wrote: new Map(), closed: new Set() };
    try {
      const [persona, profile] = await Promise.all([who.io.persona(who.audience), who.io.profile()]);
      authored = await runWatch(
        {
          shell,
          wire: attach.session.wire,
          post: attach.post,
          appendTurn: attach.appendTurn,
          persona,
          record: meter(attach.session, 'atrium.assistant.watch', 'watch'),
          principal,
          audience: who.audience,
          propertyId: who.propertyId,
          ledger,
          places: profile.places,
          signal: controller.signal,
        },
        trigger,
      );
    } catch {
      // An ambient run that fails is simply absent. Nobody asked for it, so
      // nobody gets an error about it.
    } finally {
      guarded(() => {
        inflight = undefined;
        composedFor = undefined;
        showThinking(shell, false, 0);
        ledger.sweep(shell);

        // Did the PERSON do something while the run was in flight? Opens and
        // closes of our own cards are not gestures, and `authored` removes every
        // field this answer set and every card it took down — so whatever is
        // left moved because they moved it, and the baseline stays where it was
        // so the next wake still carries the reason rather than absorbing it.
        const after = screenNow();
        const during = changesBetween(atRunStart, after, authored);
        baseline = during.length > 0 ? atRunStart : after;

        if (during.length === 0 && !pending) {
          phase = 'idle';
          return;
        }
        pending = false;
        phase = 'cooling';
        // A CANCELLED RUN DOES NOT WAIT. The gap exists to stop a run's own
        // output bouncing straight back as the next one's input, and a run that
        // was revoked produced no output — it spent the whole gap looking dead
        // to somebody who had just clicked. Clicking down a list is exactly when
        // this happens, so the cost lands on the fastest-moving person.
        later(
          () =>
            guarded(() => {
              phase = 'idle';
              consider();
            }),
          revoked ? 0 : coolMs,
        );
      });
    }
  };

  // Something opened, closed or was replaced. Unfiltered by canvas: the
  // fingerprint is already scoped, so an irrelevant push costs one comparison.
  off.push(shell.onStateChange(() => nudge()));

  // A data edit. The fingerprint decides whether it was the person or a read.
  off.push(
    shell.onDataChange((event) => {
      if (WATCHED.includes(event.canvasId)) nudge();
    }),
  );

  // A call that FAILED where they are working. The person may not see why, and a
  // path that did not work is worth another one being offered.
  off.push(
    shell.onEndpoint((event) => {
      if (event.ok || !WATCHED.includes(event.canvasId)) return;
      failures.push(`a call on their screen failed: ${event.name} returned ${event.status}`);
      nudge();
    }),
  );

  // The warm-up ends on its own even if nothing else happens, so the first real
  // gesture after a quiet login is not swallowed.
  later(
    () =>
      guarded(() => {
        if (phase !== 'warming') return;
        adopt();
        phase = 'idle';
      }),
    warmMs,
  );

  // A press while a run is going is dropped, not queued: the dock is already
  // showing the spinner, and a second run would answer a screen the first one is
  // about to change.
  const kick = (): void =>
    guarded(() => {
      if (disposed || phase === 'running') return;
      void fire(true).catch(() => dispose());
    });

  living.set(principal, { dispose, kick });
};
