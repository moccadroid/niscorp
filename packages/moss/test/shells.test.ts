import { describe, it, expect, vi } from 'vitest';
import { applyDelta, frameHash } from '../src/delta';
import type { DeltaOp } from '../src/delta';
import { createShellHost } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import type { NiscApp } from '../src/app';
import type { Connection } from '../src/socket';
import type { ScopePolicy } from '@niscorp/vex';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A connection that records what it was sent. The four-function seam, faked —
// the same shape ./node's ws transport provides.
const fakeConnection = (): Connection & { sent: Record<string, unknown>[]; closes: number[] } => {
  const sent: Record<string, unknown>[] = [];
  const closes: number[] = [];
  return {
    sent,
    closes,
    send: (text) => void sent.push(JSON.parse(text) as Record<string, unknown>),
    close: (code) => void closes.push(code ?? 1000),
    onMessage: () => {},
    onClose: () => {},
  };
};

// A minimal app with a server shell: one canvas, one action whose click
// increments its own counter. No endpoints (so no wire/transform needed).
const counter = {
  id: 'counter',
  data: { n: 0 },
  triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
};
const app = {
  charter: { public: ['counter'] },
  assignments: {},
  actions: { counter },
  shell: { canvases: [{ id: 'main', initial: 'counter' }] },
} as unknown as NiscApp;

const policy: ScopePolicy = { default: 'deny', entities: {} };

const ctx: ShellHostContext = {
  app,
  catalogFor: () => ({ ids: ['counter'], hash: 'h' }),
  variantsFor: () => new Map(),
  resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map(), policy }),
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
  runtime: {} as ShellHostContext['runtime'],
};

describe('shells — the shell host', () => {
  it('one durable shell per principal (same principal → same shell)', async () => {
    const host = createShellHost(ctx);
    const a = await host.session('t', 'usr_1');
    const b = await host.session('t', 'usr_1');
    expect(a.shell).toBe(b.shell);
  });

  it('a different principal is a different shell', async () => {
    const host = createShellHost(ctx);
    expect((await host.session('t', 'usr_1')).shell).not.toBe((await host.session('t', 'usr_2')).shell);
  });

  it('anonymous sessions are ephemeral (a fresh shell each time)', async () => {
    const host = createShellHost(ctx);
    expect((await host.session(null, null)).shell).not.toBe((await host.session(null, null)).shell);
  });

  it('dispatch(canvas, event) stamps the active instance as origin — the event is delivered', async () => {
    const host = createShellHost(ctx);
    const session = await host.session('t', 'usr_1');
    await tick();
    const active = session.shell.getState().canvases['main']?.active;
    expect(active).toBeDefined();
    // A canvas-tagged click, no client-side origin — the host stamps it.
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
  });

  it('an ungranted initial does not mount (ring 1)', async () => {
    const host = createShellHost({ ...ctx, catalogFor: () => ({ ids: [], hash: 'h' }), resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, catalog: { ids: [], hash: 'h' }, variants: new Map(), policy }) });
    const session = await host.session('t', 'usr_1');
    expect(session.shell.getState().canvases['main']?.active).toBeUndefined();
  });

  it('a held variant replaces the definition layout; behavior is untouched (ring 2)', async () => {
    // The base renders "base"; the variant renders "variant". Same action id,
    // same triggers — the substitution happens on the definition at build.
    const withLayouts = {
      ...app,
      actions: { counter: { ...counter, layout: { component: 'Text', children: 'base' } } },
      layouts: { 'counter.basic': { action: 'counter', layout: { component: 'Text', children: 'variant' } } },
    } as unknown as NiscApp;
    const rendered = async (principal: string, held: boolean): Promise<string> => {
      const host = createShellHost({
        ...ctx,
        app: withLayouts,
        variantsFor: () => (held ? new Map([['counter', { component: 'Text', children: 'variant' }]]) : new Map()),
        resolve: async () => ({
          roles: ['public'],
          scope: {},
          installed: undefined,
          catalog: { ids: ['counter'], hash: 'h' },
          variants: held ? new Map([['counter', { component: 'Text', children: 'variant' }]]) : new Map(),
          policy,
        }),
      });
      return JSON.stringify((await host.session('t', principal)).shell.flattenRenderTree((await host.session('t', principal)).shell.getCanvasRenderTree('main')));
    };
    expect(await rendered('usr_base', false)).toContain('base');
    expect(await rendered('usr_base', false)).not.toContain('variant');
    expect(await rendered('usr_held', true)).toContain('variant');
    expect(await rendered('usr_held', true)).not.toContain('"base"');

    // Behavior survives the swap: the variant principal's click still bumps.
    const host = createShellHost({
      ...ctx,
      app: withLayouts,
      variantsFor: () => new Map([['counter', { component: 'Text', children: 'variant' }]]),
    });
    const session = await host.session('t', 'usr_bump');
    await tick();
    const active = session.shell.getState().canvases['main']?.active;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// RESET — the recovery a client cannot perform for itself. The shell is
// server state keyed by principal, so dropping a token and reconnecting
// reattaches to the same wreck; only the server can throw it away.
// ═══════════════════════════════════════════════════════════════

describe('shells — reset', () => {
  it('builds a new shell and the session addresses it (the old state is gone)', async () => {
    const host = createShellHost(ctx);
    const session = await host.session('t', 'usr_1');
    await tick();
    const before = session.shell;
    const active = before.getState().canvases['main']?.active;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(before.getRuntime(active!.id)?.getData()['n']).toBe(1);

    session.reset();
    await tick();

    // A session held from before the reset must reach the NEW shell — the one
    // thing a snapshot-taking `shell` field would have got wrong.
    expect(session.shell).not.toBe(before);
    const fresh = session.shell.getState().canvases['main']?.active;
    expect(fresh).toBeDefined();
    expect(session.shell.getRuntime(fresh!.id)?.getData()['n']).toBe(0);

    // And the replacement is live, not just present.
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(fresh!.id)?.getData()['n']).toBe(1);
  });

  it('carries attached connections across — every terminal is served a fresh frame and trees', async () => {
    const host = createShellHost(ctx);
    const session = await host.session('t', 'usr_1');
    const a = fakeConnection();
    const b = fakeConnection();
    session.attach(a);
    session.attach(b);
    await tick();
    a.sent.length = 0;
    b.sent.length = 0;

    session.reset();
    await tick();

    // The same two messages a reconnect brings, on both terminals, with
    // nothing closed underneath them.
    for (const connection of [a, b]) {
      expect(connection.sent[0]?.['type']).toBe('frame');
      expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
      expect(connection.closes).toEqual([]);
    }
  });

  it('the durable map holds the replacement — a later connection joins it, not the disposed one', async () => {
    const host = createShellHost(ctx);
    const first = await host.session('t', 'usr_1');
    await tick();
    first.reset();
    await tick();
    expect((await host.session('t', 'usr_1')).shell).toBe(first.shell);
  });

  it('resetting a principal who holds no shell answers false rather than throwing', async () => {
    const host = createShellHost(ctx);
    expect(host.reset('usr_nobody')).toBe(false);
    await host.session('t', 'usr_1');
    expect(host.reset('usr_1')).toBe(true);
  });

  it('a reset that cannot build leaves the old shell standing — never nothing at all', async () => {
    // `inputs` is app code and may throw. A reset that tore the old shell down
    // first would answer a wedged session with an empty one.
    let broken = false;
    const withInputs = {
      ...app,
      shell: {
        canvases: [{ id: 'main', initial: 'counter' }],
        inputs: () => {
          if (broken) throw new Error('the boot hook is broken too');
          return {};
        },
      },
    } as unknown as NiscApp;

    const host = createShellHost({ ...ctx, app: withInputs });
    const session = await host.session('t', 'usr_1');
    await tick();
    const before = session.shell;
    const connection = fakeConnection();
    session.attach(connection);

    broken = true;
    // The rebuild is asynchronous now — `reset` answers "did they hold a shell"
    // immediately and the replacement lands a tick later, exactly as `seeds`
    // already behaved. So the failure surfaces on the console rather than to
    // this caller. What must NOT change is the guarantee underneath: a reset
    // that cannot build leaves the old shell standing.
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    session.reset();
    await tick();
    console.error = original;
    expect(errors.length).toBeGreaterThan(0);

    // Untouched: same shell, still attached, still rendering.
    expect(session.shell).toBe(before);
    expect(host.list()[0]?.connections).toBe(1);
    connection.sent.length = 0;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(before.getState().canvases['main']?.active).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// LIST — moss's own enumeration of its own map. The roster an operator
// needs to find the shell to reset, and the reason an app need not keep a
// second, drifting note beside it.
// ═══════════════════════════════════════════════════════════════

describe('shells — list', () => {
  it('reports durable shells with their attachments and what is mounted', async () => {
    const host = createShellHost(ctx);
    const session = await host.session('t', 'usr_1');
    await host.session(null, null); // an anonymous shell is not durable, so not listed
    await tick();

    expect(host.list().map((s) => s.principal)).toEqual(['usr_1']);
    expect(host.list()[0]?.canvases).toEqual([{ id: 'main', actions: ['counter'] }]);
    expect(host.list()[0]?.connections).toBe(0);
    expect(host.list()[0]?.idleSince).not.toBeNull();

    const connection = fakeConnection();
    session.attach(connection);
    expect(host.list()[0]?.connections).toBe(1);
    // Attached is not idle — the distinction the whole sweep turns on.
    expect(host.list()[0]?.idleSince).toBeNull();

    session.detach(connection);
    expect(host.list()[0]?.connections).toBe(0);
    expect(host.list()[0]?.idleSince).not.toBeNull();
  });

  it('a signed-out shell leaves the roster at once, not when somebody next looks', async () => {
    const host = createShellHost(ctx);
    await host.session('t', 'usr_1');
    await tick();
    expect(host.list()).toHaveLength(1);
    host.reset('usr_1');
    expect(host.list()).toHaveLength(1); // reset replaces, it does not remove
  });
});

// ═══════════════════════════════════════════════════════════════
// THE IDLE SWEEP — a shell nobody is attached to is a warm cache with no
// reader. Safe for the reason a process restart is safe: the projection is
// the durable thing, and the next connection rebuilds.
// ═══════════════════════════════════════════════════════════════

describe('shells — the idle sweep', () => {
  it('disposes a shell nothing has been attached to for idleMs; the next connect rebuilds', async () => {
    vi.useFakeTimers();
    try {
      const host = createShellHost({ ...ctx, idleMs: 1000 });
      const session = await host.session('t', 'usr_1');
      const before = session.shell;
      await vi.advanceTimersByTimeAsync(0);

      const connection = fakeConnection();
      session.attach(connection);
      // Attached, and long past the idle window: never collected.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(host.list()).toHaveLength(1);

      session.detach(connection);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(host.list()).toHaveLength(0);

      // Rebuilt on the next connection — the shell is a cache, not the truth.
      const after = await host.session('t', 'usr_1');
      expect(after.shell).not.toBe(before);
      expect(host.list()).toHaveLength(1);
      host.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('idleMs: 0 disables the sweep — shells live until sign-out or process exit', async () => {
    vi.useFakeTimers();
    try {
      const host = createShellHost({ ...ctx, idleMs: 0 });
      await host.session('t', 'usr_1');
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(host.list()).toHaveLength(1);
      host.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// THE RENDER GUARD — one canvas that throws must not take the session
// with it. Unguarded this was a shell wedged for the life of the process:
// the pass died mid-loop, every canvas after it went unrendered, and the
// throw escaped a microtask with nobody to catch it.
// ═══════════════════════════════════════════════════════════════

// Two canvases, and a layout that actually renders `n` — the host only sends a
// canvas whose tree CHANGED, so a bump nothing draws is correctly silent.
const twoCanvas = {
  ...app,
  actions: { counter: { ...counter, layout: { component: 'Text', children: '$.n' } } },
  shell: { canvases: [{ id: 'left', initial: 'counter' }, { id: 'right', initial: 'counter' }] },
} as unknown as NiscApp;

// ═══════════════════════════════════════════════════════════════
// FRAME DELTAS — the same frame, described against the last one. The
// invariant under test is not "smaller": it is that a terminal applying a
// delta lands on EXACTLY the bytes a terminal receiving whole frames got.
// ═══════════════════════════════════════════════════════════════

// A tree big enough that one changed number is a small part of it — the
// shape the delta layer exists for. Anything smaller is dominated by the
// ops' own JSON and is correctly sent whole.
const wide = {
  ...app,
  actions: {
    counter: {
      ...counter,
      layout: [
        ...Array.from({ length: 40 }, (_, i) => ({ component: 'Text', children: `a steady row of chrome that never changes, number ${i}` })),
        { component: 'Text', children: '$.n' },
      ],
    },
  },
} as unknown as NiscApp;

// Records the TEXT, not the parsed object — a delta is against bytes, so a
// test that only sees parsed objects cannot check the thing that matters.
const textConnection = (): Connection & { texts: string[] } => {
  const texts: string[] = [];
  return { texts, send: (text) => void texts.push(text), close: () => {}, onMessage: () => {}, onClose: () => {} };
};

const lastOfType = (texts: string[], type: string): Record<string, unknown> | undefined =>
  texts.map((t) => JSON.parse(t) as Record<string, unknown>).filter((m) => m['type'] === type).at(-1);

describe('shells — frame deltas', () => {
  it('a delta rebuilds the exact frame a whole-frame terminal was sent', async () => {
    const host = createShellHost({ ...ctx, app: wide, delta: true });
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    const silent = textConnection();
    session.attach(asked, { delta: true });
    session.attach(silent);
    await tick();

    // The baseline both ends agree on: the last whole render each was served.
    const base = asked.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1);
    expect(base).toBeDefined();
    asked.texts.length = 0;
    silent.texts.length = 0;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();

    const delta = lastOfType(asked.texts, 'render-delta');
    expect(delta).toBeDefined();
    // The connection that never asked is untouched by any of this.
    const whole = silent.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1);
    expect(whole).toBeDefined();
    expect(lastOfType(silent.texts, 'render-delta')).toBeUndefined();

    const rebuilt = applyDelta(base!, delta!['ops'] as DeltaOp[]);
    expect(rebuilt).toBe(whole);
    expect(delta!['hash']).toBe(frameHash(whole!));
    expect(delta!['canvas']).toBe('main');
    // And it is worth sending — the whole reason the encode runs.
    expect(JSON.stringify(delta).length).toBeLessThan(whole!.length * 0.6);
  });

  it('deltas chain — each one is written against the last frame, not the first', async () => {
    const host = createShellHost({ ...ctx, app: wide, delta: true });
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    session.attach(asked, { delta: true });
    await tick();

    let held = asked.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1)!;
    for (let i = 0; i < 4; i += 1) {
      asked.texts.length = 0;
      session.dispatch('main', { type: 'ui:click', ref: 'bump' });
      await tick();
      const delta = lastOfType(asked.texts, 'render-delta');
      expect(delta).toBeDefined();
      held = applyDelta(held, delta!['ops'] as DeltaOp[]);
      expect(frameHash(held)).toBe(delta!['hash']);
    }
    expect((JSON.parse(held) as { tree: unknown[] }).tree).toEqual(
      (session.shell.flattenRenderTree(session.shell.getCanvasRenderTree('main')) as unknown[]),
    );
  });

  it('off by default — a terminal that asks is still served whole frames', async () => {
    const host = createShellHost({ ...ctx, app: wide });
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    session.attach(asked, { delta: true });
    await tick();
    asked.texts.length = 0;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(lastOfType(asked.texts, 'render-delta')).toBeUndefined();
    expect(lastOfType(asked.texts, 'render')).toBeDefined();
  });

  it('resync serves whole frames without touching the shell', async () => {
    const host = createShellHost({ ...ctx, app: wide, delta: true });
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    session.attach(asked, { delta: true });
    await tick();
    const shell = session.shell;
    asked.texts.length = 0;

    session.resync(asked);
    expect(lastOfType(asked.texts, 'frame')).toBeDefined();
    expect(lastOfType(asked.texts, 'render')).toBeDefined();
    expect(lastOfType(asked.texts, 'render-delta')).toBeUndefined();
    // Not a reset: same shell, same state, nothing rebuilt.
    expect(session.shell).toBe(shell);

    // And it is level again — the next change is a delta against what resync
    // just handed over.
    const base = asked.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1)!;
    asked.texts.length = 0;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    const delta = lastOfType(asked.texts, 'render-delta');
    expect(delta).toBeDefined();
    expect(frameHash(applyDelta(base, delta!['ops'] as DeltaOp[]))).toBe(delta!['hash']);
  });

  it('a reset carries the capability across — the replacement still deltas', async () => {
    const host = createShellHost({ ...ctx, app: wide, delta: true });
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    session.attach(asked, { delta: true });
    await tick();

    session.reset();
    await tick();
    const base = asked.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1)!;
    asked.texts.length = 0;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    const delta = lastOfType(asked.texts, 'render-delta');
    expect(delta).toBeDefined();
    expect(frameHash(applyDelta(base, delta!['ops'] as DeltaOp[]))).toBe(delta!['hash']);
  });

  it('a detached connection is forgotten by both sets', async () => {
    const host = createShellHost({ ...ctx, app: wide, delta: true });
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    session.attach(asked, { delta: true });
    await tick();
    session.detach(asked);
    asked.texts.length = 0;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(asked.texts).toEqual([]);
  });
});

describe('shells — a canvas that fails to render', () => {
  it('does not stop its neighbours, on attach or on any later pass', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const host = createShellHost({ ...ctx, app: twoCanvas });
      const session = await host.session('t', 'usr_1');
      await tick();

      // The narrowest possible break: this one canvas throws while rendering.
      const shell = session.shell as unknown as { getCanvasRenderTree: (id: string) => unknown };
      const original = shell.getCanvasRenderTree.bind(shell);
      shell.getCanvasRenderTree = (id: string) => {
        if (id === 'left') throw new Error('a poisoned tree');
        return original(id);
      };

      const connection = fakeConnection();
      session.attach(connection);
      // Attach still serves: the frame, and every canvas that can render.
      expect(connection.sent[0]?.['type']).toBe('frame');
      const canvases = connection.sent.filter((m) => m['type'] === 'render').map((m) => m['canvas']);
      expect(canvases).toEqual(['right']);

      // And the session goes on working — a later change reaches the healthy
      // canvas rather than dying on the broken one.
      connection.sent.length = 0;
      const active = session.shell.getState().canvases['right']?.active;
      session.dispatch('right', { type: 'ui:click', ref: 'bump' });
      await tick();
      expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
      expect(connection.sent.some((m) => m['canvas'] === 'right')).toBe(true);
      expect(errors).toHaveBeenCalled(); // and it is never swallowed silently
    } finally {
      errors.mockRestore();
    }
  });

  it('reset is the way out — the replacement renders every canvas again', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const host = createShellHost({ ...ctx, app: twoCanvas });
      const session = await host.session('t', 'usr_1');
      await tick();
      const shell = session.shell as unknown as { getCanvasRenderTree: (id: string) => unknown };
      shell.getCanvasRenderTree = () => {
        throw new Error('every canvas is poisoned');
      };

      const connection = fakeConnection();
      session.attach(connection);
      expect(connection.sent.filter((m) => m['type'] === 'render')).toHaveLength(0);

      connection.sent.length = 0;
      session.reset();
      await tick();

      // The patch went with the shell that carried it — which is the point:
      // a reset does not repair the shell, it replaces it.
      const canvases = connection.sent.filter((m) => m['type'] === 'render').map((m) => m['canvas']);
      expect(canvases).toEqual(['left', 'right']);
    } finally {
      errors.mockRestore();
    }
  });
});
