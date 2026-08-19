import { describe, it, expect, afterEach, vi } from 'vitest';
import { trapBack } from '../src/terminal/history';
import { mountTerminal } from '../src/terminal';
import type { Target } from '../src/terminal';
import type { Wire } from '../src/client';

// ═══════════════════════════════════════════════════════════════
// The back gesture, end to end on the terminal's side: the browser's back
// button is caught before it can unload the page, and arrives at the wire as
// one message naming no canvas.
//
// `history.ts` is the one file in the terminal that reads a global, because
// the thing it traps IS a global. So a fake window goes on globalThis for the
// life of a case — the same shape a browser presents, driven by hand.
// ═══════════════════════════════════════════════════════════════

type FakeWindow = {
  history: { pushState: (state: unknown, title: string) => void; state: unknown; entries: number };
  listeners: Map<string, Set<() => void>>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  // the gesture: spend one entry and notify, exactly as a browser does
  pressBack: () => void;
};

const fakeWindow = (options: { refusePushState?: boolean } = {}): FakeWindow => {
  const listeners = new Map<string, Set<() => void>>();
  const win: FakeWindow = {
    history: {
      state: null,
      entries: 0,
      pushState: (state) => {
        if (options.refusePushState === true) throw new Error('sandboxed document');
        win.history.entries += 1;
        win.history.state = state;
      },
    },
    listeners,
    addEventListener: (type, fn) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type, fn) => void listeners.get(type)?.delete(fn),
    pressBack: () => {
      // Nothing to pop means the press leaves the app — the failure this whole
      // mechanism exists to prevent, so the fake refuses to pretend otherwise.
      if (win.history.entries === 0) throw new Error('the back button left the app');
      win.history.entries -= 1;
      for (const fn of [...(listeners.get('popstate') ?? [])]) fn();
    },
  };
  return win;
};

const install = (win: FakeWindow | undefined): void => {
  if (win === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = win;
};

afterEach(() => {
  install(undefined);
  vi.restoreAllMocks();
});

describe('trapBack — the browser back button', () => {
  it('keeps a spare history entry so a press has something to consume', () => {
    const win = fakeWindow();
    install(win);
    trapBack(() => undefined);
    expect(win.history.entries).toBe(1);
  });

  it('hands the press to the handler instead of letting the page unload', () => {
    const win = fakeWindow();
    install(win);
    const handler = vi.fn();
    trapBack(handler);

    win.pressBack();

    expect(handler).toHaveBeenCalledTimes(1);
    // Spent, then replaced: the next press has an entry waiting too.
    expect(win.history.entries).toBe(1);
  });

  it('survives being pressed over and over — the app is never left', () => {
    const win = fakeWindow();
    install(win);
    const handler = vi.fn();
    trapBack(handler);

    for (let i = 0; i < 10; i += 1) win.pressBack();

    expect(handler).toHaveBeenCalledTimes(10);
    expect(win.history.entries).toBe(1);
  });

  it('replaces the entry BEFORE acting, so a slow handler cannot lose the trap', () => {
    const win = fakeWindow();
    install(win);
    let entriesWhenHandled = -1;
    trapBack(() => {
      entriesWhenHandled = win.history.entries;
    });

    win.pressBack();

    expect(entriesWhenHandled).toBe(1);
  });

  it('stops trapping once disposed', () => {
    const win = fakeWindow();
    install(win);
    const handler = vi.fn();
    const dispose = trapBack(handler);

    dispose();
    win.pressBack();

    expect(handler).not.toHaveBeenCalled();
    expect(win.listeners.get('popstate')?.size ?? 0).toBe(0);
  });

  it('is a no-op with no window at all — a TTY, a TUI, a plain process', () => {
    install(undefined);
    const dispose = trapBack(() => undefined);
    expect(() => dispose()).not.toThrow();
  });

  it('a document that refuses pushState still gets its keypress back', () => {
    const win = fakeWindow({ refusePushState: true });
    install(win);
    expect(() => trapBack(() => undefined)).not.toThrow();
    expect(win.history.entries).toBe(0);
  });
});

// ── the whole terminal path ──

const silentTarget: Target = () => ({ update: () => undefined, destroy: () => undefined });

const fakeWire = (): Wire & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    subscribe: () => () => undefined,
    snapshot: () => ({ frame: [], trees: new Map() }),
    status: () => 'open',
    dispatch: () => calls.push('dispatch'),
    publish: () => calls.push('publish'),
    reset: () => calls.push('reset'),
    back: () => calls.push('back'),
    dispose: () => calls.push('dispose'),
  } as Wire & { calls: string[] };
};

describe('mountTerminal — the back gesture on the wire', () => {
  it('a press of the browser back button becomes one message up the wire', () => {
    const win = fakeWindow();
    install(win);
    const wire = fakeWire();
    mountTerminal({ targets: { silent: silentTarget }, wire });

    win.pressBack();

    expect(wire.calls).toEqual(['back']);
  });

  it('exposes back as a control a host can bind to its own button', () => {
    const win = fakeWindow();
    install(win);
    const wire = fakeWire();
    const terminal = mountTerminal({ targets: { silent: silentTarget }, wire });

    terminal.back();

    expect(wire.calls).toEqual(['back']);
  });

  it('trapBack: false leaves the host its own back button', () => {
    const win = fakeWindow();
    install(win);
    const wire = fakeWire();
    mountTerminal({ targets: { silent: silentTarget }, wire, trapBack: false });

    expect(win.history.entries).toBe(0);
    expect(() => win.pressBack()).toThrow('the back button left the app');
  });

  it('destroy stops trapping — nothing left listening on the page', () => {
    const win = fakeWindow();
    install(win);
    const wire = fakeWire();
    const terminal = mountTerminal({ targets: { silent: silentTarget }, wire });

    terminal.destroy();
    win.pressBack();

    expect(wire.calls).toEqual([]);
  });
});
