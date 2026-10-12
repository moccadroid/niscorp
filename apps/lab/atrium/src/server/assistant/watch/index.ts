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

type Phase = 'warming' | 'idle' | 'running' | 'cooling';

export const WATCHED_AUDIENCES: readonly string[] = ['desk'];

const dial = (name: string, fallback: number): number => {
  const raw = Number(process.env[name] ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export type WatchAttach = {
  session: FunctionSession;
  post: (path: string, body: unknown) => Promise<unknown>;
  appendTurn: (role: string, body: string, origin: 'chat' | 'watch') => Promise<unknown>;
};

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

  // `session.shell` throws until the session finishes building, and this runs
  // mid-build, so everything starts on the next tick.
  setTimeout(() => {
    let shell: Shell;
    try {
      shell = attach.session.shell;
    } catch {
      return;
    }
    void begin(attach, principal, shell, user.audience, user.propertyId).catch(() => undefined);
  }, 0);
};

const begin = async (attach: WatchAttach, principal: string, shell: Shell, audience: string, propertyId: string): Promise<void> => {
  const io = assistantSession(attach.session);

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

  let inflight: AbortController | undefined;
  let composedFor: Fingerprint | undefined;

  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const off: (() => void)[] = [];

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
    inflight?.abort();
    inflight = undefined;
    for (const stop of off) stop();
    off.length = 0;
    for (const handle of timers) clearTimeout(handle);
    timers.clear();
    settleTimer = undefined;

    living.delete(principal);
  };

  // Every caller is a timer or a subscription callback, where a throw would end
  // the server. The usual cause is an unreadable shell (signed out, dev reload).
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
      // Only a card of theirs opening or closing cancels the run, never a value
      // changing inside one: a clerk typing would otherwise never get an answer.
      if (phase === 'running' && composedFor !== undefined && navigatedBetween(composedFor, screenNow())) inflight?.abort();
      return;
    }
    if (changesNow(baseline, screenNow()).length === 0) return;
    void fire().catch(() => dispose());
  };

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
    let revoked = false;
    controller.signal.addEventListener('abort', () => {
      revoked = true;
    });
    showThinking(shell, true, 0);
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
      // Nobody asked for an ambient run, so nobody is shown its failure.
    } finally {
      guarded(() => {
        inflight = undefined;
        composedFor = undefined;
        showThinking(shell, false, 0);
        ledger.sweep(shell);

        // Without what this run wrote and closed, `during` is what the person did
        // meanwhile. If anything, the baseline stays put so the next run still sees it.
        const after = screenNow();
        const during = changesBetween(atRunStart, after, authored);
        baseline = during.length > 0 ? atRunStart : after;

        if (during.length === 0 && !pending) {
          phase = 'idle';
          return;
        }
        pending = false;
        phase = 'cooling';
        // The gap stops a run's own output coming straight back as the next run's
        // input. A revoked run produced none, so it does not wait.
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

  off.push(shell.onStateChange(() => nudge()));

  off.push(
    shell.onDataChange((event) => {
      if (WATCHED.includes(event.canvasId)) nudge();
    }),
  );

  off.push(
    shell.onEndpoint((event) => {
      if (event.ok || !WATCHED.includes(event.canvasId)) return;
      failures.push(`a call on their screen failed: ${event.name} returned ${event.status}`);
      nudge();
    }),
  );

  later(
    () =>
      guarded(() => {
        if (phase !== 'warming') return;
        adopt();
        phase = 'idle';
      }),
    warmMs,
  );

  const kick = (): void =>
    guarded(() => {
      if (disposed || phase === 'running') return;
      void fire(true).catch(() => dispose());
    });

  living.set(principal, { dispose, kick });
};
