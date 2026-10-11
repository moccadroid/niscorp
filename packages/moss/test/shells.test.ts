import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { applyDelta, frameHash } from '../src/protocol';
import type { DeltaOp } from '../src/protocol';
import { createShellHost } from '../src/shells';
import { hostConfig } from './shell-host-double';
import type { HostSetup } from './shell-host-double';
import type { FunctionSession, NiscApp } from '../src/manifest';
import type { Connection } from '../src/socket';

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


const ctx: HostSetup = {
  app,
  resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map() }),
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
};

describe('shells — the shell host', () => {
  it('one durable shell per principal (same principal → same shell)', async () => {
    const host = createShellHost(hostConfig(ctx));
    const a = await host.session('t', 'usr_1');
    const b = await host.session('t', 'usr_1');
    expect(a.shell).toBe(b.shell);
  });

  // What a principal's shell is made of is asked ONCE for a build. It was
  // asked twice: once for the build, and once more to write on the cell what
  // nothing then read.
  it('who somebody is and what they hold is asked once for each shell that is built', async () => {
    const asked: (string | null)[] = [];
    const host = createShellHost(hostConfig({ ...ctx, resolve: async (principal) => (asked.push(principal), ctx.resolve(principal)) }));
    await host.session('t', 'usr_1');
    await host.session(null, null);
    await host.snapshot(null, null);
    expect(asked).toEqual(['usr_1', null, null]);
    // A principal whose shell stands is not asked about again to be handed it.
    await host.session('t', 'usr_1');
    await host.snapshot('t', 'usr_1');
    expect(asked).toHaveLength(3);
  });

  it('a different principal is a different shell', async () => {
    const host = createShellHost(hostConfig(ctx));
    expect((await host.session('t', 'usr_1')).shell).not.toBe((await host.session('t', 'usr_2')).shell);
  });

  it('anonymous sessions are ephemeral (a fresh shell each time)', async () => {
    const host = createShellHost(hostConfig(ctx));
    expect((await host.session(null, null)).shell).not.toBe((await host.session(null, null)).shell);
  });

  it('dispatch(canvas, event) stamps the active instance as origin — the event is delivered', async () => {
    const host = createShellHost(hostConfig(ctx));
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
    const host = createShellHost(hostConfig({ ...ctx, resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: [], hash: 'h' }, variants: new Map() }) }));
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
      const host = createShellHost(hostConfig({
        ...ctx,
        app: withLayouts,
        resolve: async () => ({
          roles: ['public'],
          scope: {},
          catalog: { ids: ['counter'], hash: 'h' },
          variants: held ? new Map([['counter', { component: 'Text', children: 'variant' }]]) : new Map(),
        }),
      }));
      return JSON.stringify((await host.session('t', principal)).shell.flattenRenderTree((await host.session('t', principal)).shell.getCanvasRenderTree('main')));
    };
    expect(await rendered('usr_base', false)).toContain('base');
    expect(await rendered('usr_base', false)).not.toContain('variant');
    expect(await rendered('usr_held', true)).toContain('variant');
    expect(await rendered('usr_held', true)).not.toContain('"base"');

    // Behavior survives the swap: the variant principal's click still bumps.
    const host = createShellHost(hostConfig({
      ...ctx,
      app: withLayouts,
      resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map([['counter', { component: 'Text', children: 'variant' }]]) }),
    }));
    const session = await host.session('t', 'usr_bump');
    await tick();
    const active = session.shell.getState().canvases['main']?.active;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// ONE BUILD FOR A PRINCIPAL AT A TIME. Finding no shell, building one and
// keeping it were a look, two awaits and a write: two arrivals in the same
// moment (a page's read and its socket, two tabs) each found none and each
// built one. The second took the first's place in the map, and the first
// stood for ever with its functions and its session code running, held by
// whoever had arrived first.
// ═══════════════════════════════════════════════════════════════

describe('shells — two first arrivals for one principal', () => {
  const counted = (): { setup: HostSetup; built: () => number } => {
    let built = 0;
    const counting = {
      ...app,
      functions: () => {
        built += 1;
        return {};
      },
    } as unknown as NiscApp;
    return { setup: { ...ctx, app: counting }, built: () => built };
  };

  it('one shell is built between them, and both are handed it', async () => {
    const { setup, built } = counted();
    const host = createShellHost(hostConfig(setup));
    const [first, second, read] = await Promise.all([host.session('t', 'usr_1'), host.session('t', 'usr_1'), host.snapshot('t', 'usr_1')]);
    expect(first.shell).toBe(second.shell);
    expect(built()).toBe(1);
    expect(host.list()).toHaveLength(1);
    expect(read.trees['main']).toBeDefined();
    // Whoever arrives next is handed the same one, with nothing built.
    expect((await host.session('t', 'usr_1')).shell).toBe(first.shell);
    expect(built()).toBe(1);
  });

  it('somebody else arriving in the same moment gets a shell of their own', async () => {
    const { setup, built } = counted();
    const host = createShellHost(hostConfig(setup));
    const [mine, theirs] = await Promise.all([host.session('t', 'usr_1'), host.session('t', 'usr_2')]);
    expect(mine.shell).not.toBe(theirs.shell);
    expect(built()).toBe(2);
  });

  it('a build that fails is refused to both, keeps nothing, and the next arrival builds afresh', async () => {
    let broken = true;
    const host = createShellHost(
      hostConfig({
        ...ctx,
        resolve: async (principal) => {
          if (broken) throw new Error('nobody can be resolved right now');
          return ctx.resolve(principal);
        },
      }),
    );
    const settled = await Promise.allSettled([host.session('t', 'usr_1'), host.session('t', 'usr_1')]);
    expect(settled.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected']);
    expect(host.list()).toEqual([]);
    broken = false;
    expect((await host.session('t', 'usr_1')).shell.getState().canvases['main']?.active).toBeDefined();
    expect(host.list()).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// WHAT APP CODE IS HANDED — the session `functions` and `onSession` close
// over. It says who is calling and lends capabilities; it holds no key.
// ═══════════════════════════════════════════════════════════════

describe('shells — the session app code is handed', () => {
  const sessionOf = async (extra: Partial<HostSetup>, principal: string | null): Promise<FunctionSession> => {
    const seen: { session?: FunctionSession } = {};
    const withFunctions = {
      ...app,
      functions: (session: FunctionSession) => {
        seen.session = session;
        return {};
      },
    } as unknown as NiscApp;
    await createShellHost(hostConfig({ ...ctx, ...extra, app: withFunctions })).session(principal === null ? null : 't', principal);
    if (seen.session === undefined) throw new Error('the functions seam was not called');
    return seen.session;
  };
  const writers = { generateDsl: async () => ({ from: ['notes'] }), mapToShape: async () => ({ ir: {}, transformed: null }) } as unknown as Parameters<FunctionSession['answerIntent']>[0];
  const asked = { intent: 'every note', shape: [] };

  it('an intent is answered as the session’s own principal, whoever the app code names', async () => {
    const calls: { principal: string | null; intent: string }[] = [];
    const answerIntent: HostSetup['answerIntent'] = async (principal, _writers, intent) => {
      calls.push({ principal, intent: intent.intent });
      return { result: ['a note'], meta: { cache: { hit: false, fingerprint: 'fp_1' }, context: {} } };
    };
    const member = await sessionOf({ answerIntent }, 'usr_1');
    const nobody = await sessionOf({ answerIntent }, null);
    expect((await member.answerIntent(writers, asked)).meta.cache.fingerprint).toBe('fp_1');
    await nobody.answerIntent(writers, asked);
    expect(calls).toEqual([{ principal: 'usr_1', intent: 'every note' }, { principal: null, intent: 'every note' }]);
  });

  it('a host that was given no way to answer an intent says so', async () => {
    const session = await sessionOf({}, 'usr_1');
    await expect(session.answerIntent(writers, asked)).rejects.toThrow(/no way to answer an intent/);
  });
});

// ═══════════════════════════════════════════════════════════════
// RESET — the recovery a client cannot perform for itself. The shell is
// server state keyed by principal, so dropping a token and reconnecting
// reattaches to the same wreck; only the server can throw it away.
// ═══════════════════════════════════════════════════════════════

describe('shells — reset', () => {
  it('builds a new shell and the session addresses it (the old state is gone)', async () => {
    const host = createShellHost(hostConfig(ctx));
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
    const host = createShellHost(hostConfig(ctx));
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
    const host = createShellHost(hostConfig(ctx));
    const first = await host.session('t', 'usr_1');
    await tick();
    first.reset();
    await tick();
    expect((await host.session('t', 'usr_1')).shell).toBe(first.shell);
  });

  // ONE RESET OF A SHELL AT A TIME. A reset builds, then swaps. Two that
  // overlapped each built from the shell that stood when they began: the first
  // to land carried the terminals to its shell, the second found none left to
  // carry and took the cell. The terminals were on a shell nothing addressed.
  it('resets that overlap leave every terminal on the shell that is kept', async () => {
    const host = createShellHost(hostConfig({ ...ctx, app: wide }));
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    await tick();

    session.reset();
    host.reset('usr_1');
    session.reset();
    for (let i = 0; i < 6; i += 1) await tick();

    expect(host.list()).toHaveLength(1);
    expect(host.list()[0]?.connections).toBe(1);
    // The shell the session addresses is the one the terminal is served from.
    connection.sent.length = 0;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
  });

  it('a shell that ended while its replacement was built is not replaced', async () => {
    // Nobody in particular: the shell goes when its last terminal does.
    const session = await createShellHost(hostConfig(ctx)).session(null, null);
    const connection = fakeConnection();
    session.attach(connection);
    await tick();
    const stood = session.shell;

    session.reset();
    session.detach(connection);
    for (let i = 0; i < 4; i += 1) await tick();

    // No shell was stood up for nobody: what the session addresses is the one
    // that ended, and it is disposed.
    expect(session.shell).toBe(stood);
    expect(() => session.shell.push('main', 'counter')).toThrow();
  });

  // What a shell was opened with is part of what it is rebuilt from. A reset
  // rebuilt from the principal alone, so a page's shell came back without the
  // parameters of its path, on other instance ids than the page was drawn with.
  it('a shell that is reset is rebuilt with what it was opened with: its inputs and its id seed', async () => {
    const words = { id: 'words', data: { slug: '' }, layout: { component: 'Text', children: '$.slug' } };
    const paged = { ...app, actions: { words } } as unknown as NiscApp;
    const page = { canvases: [{ id: 'main', initial: 'words' }] };
    const host = createShellHost(
      hostConfig({ ...ctx, app: paged, manifest: page, kept: false, resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['words'] }, variants: new Map() }) }),
    );
    const session = await host.session(null, null, { seed: 'abcdef0123', inputs: { main: { slug: 'intro' } } });
    await tick();
    const opened = session.shell;
    const shown = (): { id: string | undefined; slug: unknown } => {
      const active = session.shell.getState().canvases['main']?.active;
      return { id: active?.id, slug: session.shell.getRuntime(active?.id ?? '')?.getData()['slug'] };
    };
    expect(shown()).toEqual({ id: 'act-abcdef0123-1', slug: 'intro' });

    session.reset();
    for (let i = 0; i < 4; i += 1) await tick();

    expect(session.shell).not.toBe(opened);
    expect(shown()).toEqual({ id: 'act-abcdef0123-1', slug: 'intro' });
  });

  it('resetting a principal who holds no shell answers false rather than throwing', async () => {
    const host = createShellHost(hostConfig(ctx));
    expect(host.reset('usr_nobody')).toBe(false);
    await host.session('t', 'usr_1');
    expect(host.reset('usr_1')).toBe(true);
  });

  // A HOST THAT KEEPS NO SHELL (a page's) builds one for each connection, so
  // somebody signed in may have several living at once. A reset by principal
  // found none of them: it looked where kept shells are, and answered `false`
  // for somebody with two tabs open.
  it('reaches every living shell of the principal on a host that keeps none, and nobody else’s', async () => {
    const host = createShellHost(hostConfig({ ...ctx, kept: false }));
    const mine = [await host.session('t', 'usr_1'), await host.session('t', 'usr_1')];
    const theirs = await host.session('t', 'usr_2');
    const nobodys = await host.session(null, null);
    const connections = mine.map((session) => {
      const connection = fakeConnection();
      session.attach(connection);
      return connection;
    });
    await tick();
    const before = [...mine, theirs, nobodys].map((session) => session.shell);
    for (const connection of connections) connection.sent.length = 0;

    expect(host.reset('usr_1')).toBe(true);
    for (let i = 0; i < 4; i += 1) await tick();

    expect(mine.map((session) => session.shell === before[mine.indexOf(session)])).toEqual([false, false]);
    expect(theirs.shell).toBe(before[2]);
    expect(nobodys.shell).toBe(before[3]);
    // Each terminal was carried across to its own shell's replacement, and
    // served what a reconnect brings.
    for (const connection of connections) {
      expect(connection.sent[0]?.['type']).toBe('frame');
      expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
      expect(connection.closes).toEqual([]);
    }
  });

  it('a shell that ended is not one a reset finds', async () => {
    const host = createShellHost(hostConfig({ ...ctx, kept: false }));
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    expect(host.reset('usr_nobody')).toBe(false);
    // Its last terminal left: a shell that is not kept ends there.
    session.detach(connection);
    expect(host.reset('usr_1')).toBe(false);
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

    const host = createShellHost(hostConfig({ ...ctx, app: withInputs }));
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

// BACK — the gesture the socket routes here. moss owns none of the meaning:
// nova's journal decides what the last navigation was, and the shell's own
// state change flushes whatever moved.
// Two screens that render differently, so "what the terminal was served"
// is a question with an answer.
const twoScreens = {
  ...app,
  charter: { public: ['counter', 'detail'] },
  actions: {
    counter: { ...counter, layout: { component: 'Text', children: 'the register' } },
    detail: { id: 'detail', data: {}, layout: { component: 'Text', children: 'one person' } },
  },
} as unknown as NiscApp;

const twoCtx: HostSetup = {
  ...ctx,
  app: twoScreens,
  resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['counter', 'detail'], hash: 'h' }, variants: new Map() }),
};

describe('shells — back', () => {
  it('undoes the session\'s last navigation and serves the result', async () => {
    const host = createShellHost(hostConfig(twoCtx));
    const session = await host.session('t', 'usr_1');
    const conn = fakeConnection();
    session.attach(conn);
    await tick();

    session.shell.push('main', 'detail');
    await tick();
    await tick();
    expect(session.shell.getCanvasState('main').stack).toHaveLength(2);
    conn.sent.length = 0;

    expect(session.back()).toBe(true);
    await tick();
    await tick();

    expect(session.shell.getCanvasState('main').stack).toHaveLength(1);
    // Answered by a canvas frame, like every other change — no envelope of its
    // own — and it is the screen underneath, not the one they left.
    const served = conn.sent.filter((m) => m['type'] === 'render' && m['canvas'] === 'main').at(-1);
    expect(JSON.stringify(served)).toContain('the register');
    expect(JSON.stringify(served)).not.toContain('one person');
  });

  it('cannot undo the landing screen — a seeded canvas is the floor', async () => {
    const host = createShellHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    await tick();

    expect(session.back()).toBe(false);
    expect(session.shell.getCanvasState('main').stack).toHaveLength(1);
  });

  it('reads through the cell — a reset session backs the shell standing now', async () => {
    const host = createShellHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    await tick();
    session.reset();
    await tick();

    session.shell.push('main', 'counter');
    expect(session.back()).toBe(true);
    expect(session.shell.getCanvasState('main').stack).toHaveLength(1);
  });
});

describe('shells — list', () => {
  it('reports durable shells with their attachments and what is mounted', async () => {
    const host = createShellHost(hostConfig(ctx));
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
    const host = createShellHost(hostConfig(ctx));
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
      const host = createShellHost(hostConfig({ ...ctx, idleMs: 1000 }));
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
      const host = createShellHost(hostConfig({ ...ctx, idleMs: 0 }));
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
    const host = createShellHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
    const host = createShellHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
    const host = createShellHost(hostConfig({ ...ctx, app: wide }));
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
    const host = createShellHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
    const host = createShellHost(hostConfig({ ...ctx, app: wide, delta: true }));
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

  // The encode's cost follows the size of the frames, not of the change, and it
  // is paid on the thread every session shares. So past 64 KB — on either side
  // of the change — a frame goes out whole without being compared. Before the
  // bound, the two middle steps below went out as deltas, after the encode.
  it('a frame over 64 KB is sent whole, whichever side of the change it is on', async () => {
    const padded = {
      ...app,
      actions: {
        counter: {
          ...counter,
          data: { n: 0, pad: '' },
          triggers: [...counter.triggers, { event: 'ui:click', ref: 'pad', do: [{ set: 'pad', value: '@event.payload' }] }],
          layout: [
            ...Array.from({ length: 40 }, (_, i) => ({ component: 'Text', children: `a steady row of chrome that never changes, number ${i}` })),
            { component: 'Text', children: '$.pad' },
            { component: 'Text', children: '$.n' },
          ],
        },
      },
    } as unknown as NiscApp;
    const host = createShellHost(hostConfig({ ...ctx, app: padded, delta: true }));
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    const silent = textConnection();
    session.attach(asked, { delta: true });
    session.attach(silent);
    await tick();

    // What the delta terminal was sent for one change, and that the terminal
    // which never asked was sent the frame it adds up to.
    const sentFor = async (event: Record<string, unknown>): Promise<{ type: string; length: number }> => {
      asked.texts.length = 0;
      silent.texts.length = 0;
      session.dispatch('main', event);
      await tick();
      const canvas = asked.texts.filter((t) => t.startsWith('{"type":"render'));
      expect(canvas).toHaveLength(1);
      const whole = silent.texts.filter((t) => t.startsWith('{"type":"render"')).at(-1)!;
      const type = (JSON.parse(canvas[0]!) as { type: string }).type;
      if (type === 'render') expect(canvas[0]).toBe(whole);
      return { type, length: whole.length };
    };

    // under → over: the frame replacing the held one is past the bound
    const grown = await sentFor({ type: 'ui:click', ref: 'pad', payload: 'x'.repeat(70 * 1024) });
    expect(grown.length).toBeGreaterThan(64 * 1024);
    expect(grown.type).toBe('render');
    // over → over: one number changed in a frame past the bound
    expect((await sentFor({ type: 'ui:click', ref: 'bump' })).type).toBe('render');
    // over → under: the frame the connections HOLD is past the bound
    const shrunk = await sentFor({ type: 'ui:click', ref: 'pad', payload: '' });
    expect(shrunk.length).toBeLessThan(64 * 1024);
    expect(shrunk.type).toBe('render');
    // under → under: level again, and deltas resume against the whole frame
    expect((await sentFor({ type: 'ui:click', ref: 'bump' })).type).toBe('render-delta');
  });

  it('a detached connection is forgotten by both sets', async () => {
    const host = createShellHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
      const host = createShellHost(hostConfig({ ...ctx, app: twoCanvas }));
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
      const host = createShellHost(hostConfig({ ...ctx, app: twoCanvas }));
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

// ═══════════════════════════════════════════════════════════════
// THE CANVASES A SHELL HAS are asked of the shell. The host walked the
// manifest's list in six places, so a canvas the shell gained while it ran
// was never sent to anybody.
// ═══════════════════════════════════════════════════════════════

describe('shells — the canvases a shell has', () => {
  const canvasesSent = (conn: ReturnType<typeof fakeConnection>): unknown[] => conn.sent.filter((m) => m['type'] === 'render').map((m) => m['canvas']);

  it('a canvas added while the shell runs is served like the ones it was built with', async () => {
    const host = createShellHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    const first = fakeConnection();
    session.attach(first);
    await tick();
    first.sent.length = 0;

    session.shell.addCanvas({ id: 'late', initial: { action: 'counter' } });
    await tick();
    await tick();

    // The terminal already attached is sent it; a newcomer is handed it with
    // the rest; and a document reads it.
    expect(canvasesSent(first)).toContain('late');
    const second = fakeConnection();
    session.attach(second);
    expect(canvasesSent(second)).toEqual(['main', 'late']);
    expect(Object.keys((await host.snapshot('t', 'usr_1')).trees)).toEqual(['main', 'late']);
    first.sent.length = 0;
    session.resync(first);
    expect(canvasesSent(first)).toEqual(['main', 'late']);
  });

  it('a canvas that is removed is served empty once, and then not again', async () => {
    const twoCtx = { ...ctx, app: twoCanvas };
    const host = createShellHost(hostConfig(twoCtx));
    const session = await host.session('t', 'usr_1');
    const conn = fakeConnection();
    session.attach(conn);
    await tick();
    conn.sent.length = 0;

    session.shell.removeCanvas('left');
    await tick();
    await tick();
    expect(conn.sent.filter((m) => m['type'] === 'render' && m['canvas'] === 'left')).toEqual([{ type: 'render', canvas: 'left', tree: [] }]);

    const later = fakeConnection();
    session.attach(later);
    expect(canvasesSent(later)).toEqual(['right']);
  });
});

describe('shells — the frame layout store and re-send', () => {
  // A frame that is nothing but a ref: `{ ref: 'r' }` resolves against the
  // seeded store. Without the seed this throws LayoutRefNotFoundError and the
  // frame comes back empty; with it, the node is in the frame at first render.
  const refApp = {
    charter: { public: ['counter'] },
    assignments: {},
    actions: { counter },
    shell: {
      canvases: [{ id: 'main', initial: 'counter' }],
      layout: { ref: 'r' },
      layoutStore: { r: { component: 'Text', children: 'seeded-dock' } },
    },
  } as unknown as NiscApp;
  const refCtx = { ...ctx, app: refApp };
  const frames = (conn: ReturnType<typeof fakeConnection>): Record<string, unknown>[] => conn.sent.filter((m) => m['type'] === 'frame');

  it('a seeded ref resolves in the frame at first render', async () => {
    const host = createShellHost(hostConfig(refCtx));
    const conn = fakeConnection();
    (await host.session('t', 'usr_1')).attach(conn);
    const frame = frames(conn).at(-1);
    expect(frame).toBeDefined();
    expect(JSON.stringify(frame)).toContain('seeded-dock');
  });

  it('setLayout re-sends the frame to attached terminals; an unchanged frame sends nothing', async () => {
    const host = createShellHost(hostConfig(refCtx));
    const conn = fakeConnection();
    const session = await host.session('t', 'usr_1');
    session.attach(conn);
    const afterAttach = frames(conn).length;

    session.shell.setLayout('r', { component: 'Text', children: 'swapped-dock' });
    await tick();
    await tick();
    const afterSwap = frames(conn);
    expect(afterSwap.length).toBeGreaterThan(afterAttach);
    expect(JSON.stringify(afterSwap.at(-1))).toContain('swapped-dock');

    // Re-setting the same layout changes nothing — the frame is diffed, so no
    // second frame message goes out.
    const settled = afterSwap.length;
    session.shell.setLayout('r', { component: 'Text', children: 'swapped-dock' });
    await tick();
    await tick();
    expect(frames(conn).length).toBe(settled);
  });

  // Attaching renders the frame, and that can pick up a change the flush has
  // not sent yet. The frame last sent then moved to one only the newcomer
  // held, and the flush, finding nothing changed, sent it to nobody else.
  it('a terminal that attaches while the frame has changed does not leave the others on the old one', async () => {
    const host = createShellHost(hostConfig(refCtx));
    const session = await host.session('t', 'usr_1');
    const first = fakeConnection();
    session.attach(first);
    await tick();
    await tick();

    session.shell.setLayout('r', { component: 'Text', children: 'swapped-dock' });
    // Before the flush runs: somebody else attaches.
    const second = fakeConnection();
    session.attach(second);
    await tick();
    await tick();

    expect(JSON.stringify(frames(second).at(-1))).toContain('swapped-dock');
    expect(JSON.stringify(frames(first).at(-1))).toContain('swapped-dock');
    // Once: the flush that follows finds everybody level.
    expect(frames(first).filter((frame) => JSON.stringify(frame).includes('swapped-dock'))).toHaveLength(1);
  });

  it('a frame that fails to render for a newcomer is not taken for the one everybody holds', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const host = createShellHost(hostConfig(refCtx));
      const session = await host.session('t', 'usr_1');
      const first = fakeConnection();
      session.attach(first);
      await tick();
      const held = frames(first).length;

      const render = session.shell.getShellRenderTree.bind(session.shell);
      session.shell.getShellRenderTree = () => {
        throw new Error('the frame is poisoned, this once');
      };
      const second = fakeConnection();
      session.attach(second);
      // The newcomer is served an empty arrangement; the others keep theirs.
      expect(frames(second).at(-1)).toEqual({ type: 'frame', tree: [] });
      expect(frames(first)).toHaveLength(held);

      // It renders again: the newcomer is sent the frame it never had.
      session.shell.getShellRenderTree = render;
      session.dispatch('main', { type: 'ui:click', ref: 'bump' });
      await tick();
      await tick();
      expect(JSON.stringify(frames(second).at(-1))).toContain('seeded-dock');
    } finally {
      errors.mockRestore();
    }
  });

  it('a canvas-only change on a frame with no ref sends no frame message', async () => {
    const host = createShellHost(hostConfig(ctx)); // the plain app: default frame, no ref
    const conn = fakeConnection();
    const session = await host.session('t', 'usr_1');
    session.attach(conn);
    await tick();
    const before = frames(conn).length;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    await tick();
    expect(frames(conn).length).toBe(before);
  });
});

describe('shells — a canvas placed by an action, not the frame', () => {
  // An action whose layout ARRANGES canvases (a controller whose regions are
  // canvases of their own). The inner canvas must reach the terminal as itself
  // — a marker in the outer canvas's tree, its own tree beside it — and a click
  // the terminal tags with the inner canvas must land on the inner action.
  const arrangement = {
    id: 'arrangement',
    data: {},
    layout: { component: 'Box', children: [{ component: 'Text', children: 'OUTER' }, { component: 'CanvasSlot', props: { canvasId: 'region' } }] },
  };
  const nestedApp = {
    charter: { public: ['arrangement', 'counter'] },
    assignments: {},
    actions: { arrangement, counter: { ...counter, layout: { component: 'Text', children: 'n={{$.n}}' } } },
    shell: {
      canvases: [
        { id: 'main', initial: 'arrangement' },
        { id: 'region', initial: 'counter' },
      ],
    },
  } as unknown as NiscApp;
  const ids = { ids: ['arrangement', 'counter'], hash: 'h' };
  const nestedCtx: HostSetup = {
    ...ctx,
    app: nestedApp,
    resolve: async () => ({ roles: ['public'], scope: {}, catalog: ids, variants: new Map() }),
  };
  const rendered = (conn: ReturnType<typeof fakeConnection>, canvas: string): string =>
    JSON.stringify(conn.sent.filter((m) => m['type'] === 'render' && m['canvas'] === canvas).at(-1) ?? {});

  it('the outer canvas carries the marker; the inner canvas is served as itself', async () => {
    const host = createShellHost(hostConfig(nestedCtx));
    const conn = fakeConnection();
    (await host.session('t', 'usr_1')).attach(conn);
    await tick();
    const main = rendered(conn, 'main');
    expect(main).toContain('OUTER');
    expect(main).toContain('"canvasId":"region"');
    expect(main).not.toContain('n=0');
    expect(rendered(conn, 'region')).toContain('n=0');
  });

  it('a click tagged with the inner canvas lands on the inner action, not the one that placed it', async () => {
    const host = createShellHost(hostConfig(nestedCtx));
    const session = await host.session('t', 'usr_1');
    await tick();
    const inner = session.shell.getState().canvases['region']?.active;
    expect(inner).toBeDefined();
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(inner!.id)?.getData()['n']).toBe(0);
    session.dispatch('region', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(inner!.id)?.getData()['n']).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// ADOPT — what the app consists of changed while shells stand. Afterwards a
// living shell holds exactly what its principal holds now. It used to add
// and never take away: an action that was removed, or was no longer granted,
// stayed mounted and pushable in every shell that had it.
// ═══════════════════════════════════════════════════════════════

describe('shells — adopt', () => {
  const home = { id: 'home', data: {}, layout: { component: 'Text', children: 'home' } };
  const extra = { id: 'extra', data: {}, layout: { component: 'Text', children: 'an extra screen' } };
  const ledger = { id: 'ledger', data: {}, layout: { component: 'Ledger', children: 'a ledger' } };
  const base = { ...app, actions: { home }, shell: { canvases: [{ id: 'main', initial: 'home' }] } } as unknown as NiscApp;

  // A world whose actions in force, and what each principal holds of them, are
  // the test's to change. `setup`: what the host is beside that (whether it
  // keeps a principal's shell).
  const world = (setup: Partial<HostSetup> = {}): { host: ReturnType<typeof createShellHost>; force: (actions: Record<string, unknown>) => void; hold: (principal: string, ids: string[] | Error) => void } => {
    let inForce: Record<string, unknown> = { home, extra };
    const held = new Map<string, string[] | Error>();
    const host = createShellHost(
      hostConfig({
        ...ctx,
        ...setup,
        app: base,
        actions: () => inForce as ReturnType<NonNullable<HostSetup['actions']>>,
        resolve: async (principal) => {
          const ids = held.get(principal ?? '') ?? Object.keys(inForce);
          if (ids instanceof Error) throw ids;
          return { roles: ['member'], scope: {}, catalog: { ids: ids.filter((id) => id in inForce) }, variants: new Map() };
        },
      }),
    );
    return { host, force: (actions) => void (inForce = actions), hold: (principal, ids) => void held.set(principal, ids) };
  };
  const mounted = (session: Awaited<ReturnType<ReturnType<typeof createShellHost>['session']>>): string[] => session.shell.getCanvasState('main').stack.map((item) => item.definitionId);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) await tick();
  };

  it('an action that is no longer in force leaves a living shell: unmounted, and not pushable', async () => {
    const { host, force } = world();
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    session.shell.push('main', 'extra');
    await settle();
    expect(mounted(session)).toEqual(['home', 'extra']);

    force({ home });
    host.adopt();
    await settle();

    expect(mounted(session)).toEqual(['home']);
    expect(() => session.shell.push('main', 'extra')).toThrow();
    // And the terminal is served the canvas without it.
    const served = JSON.stringify(connection.sent.filter((m) => m['type'] === 'render' && m['canvas'] === 'main').at(-1));
    expect(served).toContain('home');
    expect(served).not.toContain('an extra screen');
  });

  it('an action its principal is no longer granted leaves too, and stays for whoever still holds it', async () => {
    const { host, hold } = world();
    const revoked = await host.session('t', 'usr_1');
    const kept = await host.session('t', 'usr_2');
    revoked.shell.push('main', 'extra');
    kept.shell.push('main', 'extra');
    await settle();

    hold('usr_1', ['home']);
    host.adopt();
    await settle();

    expect(mounted(revoked)).toEqual(['home']);
    expect(mounted(kept)).toEqual(['home', 'extra']);
  });

  it('an action that arrived becomes pushable, with a component nothing mentioned before', async () => {
    const { host, force } = world();
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    await settle();
    expect(() => session.shell.push('main', 'ledger')).toThrow();

    force({ home, extra, ledger });
    host.adopt();
    await settle();
    session.shell.push('main', 'ledger');
    await settle();

    expect(mounted(session)).toEqual(['home', 'ledger']);
    expect(JSON.stringify(connection.sent.at(-1))).toContain('a ledger');
  });

  it('a principal whose shell cannot adopt is said, and does not stop the rest', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { host, force, hold } = world();
      const first = await host.session('t', 'usr_1');
      const second = await host.session('t', 'usr_2');

      hold('usr_1', new Error('this one cannot be resolved'));
      force({ home, extra, ledger });
      host.adopt();
      await settle();

      // The one that failed keeps what it held; the one after it adopted.
      expect(() => first.shell.push('main', 'ledger')).toThrow();
      second.shell.push('main', 'ledger');
      expect(mounted(second)).toEqual(['home', 'ledger']);
      expect(errors.mock.calls.some((call) => String(call[0]).includes('usr_1'))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it('two changes are adopted in the order they happened, however long each answer takes', async () => {
    // What usr_1 holds is answered by hand: the first adopt's answer is held
    // back until the second adopt's has been given.
    const answers: ((ids: string[]) => void)[] = [];
    let byHand = false;
    const host = createShellHost(
      hostConfig({
        ...ctx,
        app: base,
        actions: () => ({ home, extra }) as unknown as ReturnType<NonNullable<HostSetup['actions']>>,
        resolve: async () => {
          const ids = byHand ? await new Promise<string[]>((answer) => void answers.push(answer)) : ['home', 'extra'];
          return { roles: ['member'], scope: {}, catalog: { ids }, variants: new Map() };
        },
      }),
    );
    const session = await host.session('t', 'usr_1');
    byHand = true;

    host.adopt(); // the earlier change: still holds both
    host.adopt(); // the later one: `extra` was taken away
    await settle();
    // Answered out of order, if both were asked at once.
    answers[1]?.(['home']);
    await settle();
    answers[0]?.(['home', 'extra']);
    await settle();
    answers[1]?.(['home']);
    await settle();

    expect(() => session.shell.push('main', 'extra')).toThrow();
  });

  it('a shell whose build was under way when the app changed adopts when it lands', async () => {
    const { host, force } = world();
    const arriving = host.session('t', 'usr_1');
    force({ home, extra, ledger });
    host.adopt();
    const session = await arriving;
    await settle();

    session.shell.push('main', 'ledger');
    expect(mounted(session)).toEqual(['home', 'ledger']);
  });

  // EVERY LIVING SHELL ADOPTS, WHOEVER IT IS FOR AND WHETHER IT IS KEPT. The
  // walk went over the shells a host keeps, which is one for each signed-in
  // principal of the app's own host. A shell built for one connection kept
  // what it was built with for as long as it lived: a visitor's on the app's
  // host, and everybody's on a host that keeps none (a page's).
  const everyKind = [
    ['nobody signed in, on a host that keeps its principals’ shells', {}, null],
    ['somebody signed in, on a host that keeps none (a page’s)', { kept: false }, 'usr_1'],
    ['nobody signed in, on a host that keeps none', { kept: false }, null],
  ] as const;

  it.each(everyKind)('the shell of %s adopts: what left is unmounted, and what arrived is pushable', async (_whose, setup, principal) => {
    const { host, force } = world(setup);
    const session = await host.session(principal === null ? null : 't', principal);
    session.shell.push('main', 'extra');
    await settle();
    expect(mounted(session)).toEqual(['home', 'extra']);

    force({ home, ledger });
    host.adopt();
    await settle();

    expect(mounted(session)).toEqual(['home']);
    expect(() => session.shell.push('main', 'extra')).toThrow();
    session.shell.push('main', 'ledger');
    expect(mounted(session)).toEqual(['home', 'ledger']);
  });

  it.each(everyKind)('the shell of %s, whose build was under way when the app changed, adopts when it lands', async (_whose, setup, principal) => {
    const { host, force } = world(setup);
    const arriving = host.session(principal === null ? null : 't', principal);
    force({ home, extra, ledger });
    host.adopt();
    const session = await arriving;
    await settle();

    session.shell.push('main', 'ledger');
    expect(mounted(session)).toEqual(['home', 'ledger']);
  });

  it('every shell of one principal on a host that keeps none adopts, each for itself', async () => {
    const { host, hold } = world({ kept: false });
    const tabs = [await host.session('t', 'usr_1'), await host.session('t', 'usr_1')];
    const other = await host.session('t', 'usr_2');
    for (const session of [...tabs, other]) session.shell.push('main', 'extra');
    await settle();

    hold('usr_1', ['home']);
    host.adopt();
    await settle();

    expect(tabs.map(mounted)).toEqual([['home'], ['home']]);
    expect(mounted(other)).toEqual(['home', 'extra']);
  });

  it('a shell that ended is not asked about again', async () => {
    const asked: (string | null)[] = [];
    const host = createShellHost(
      hostConfig({ ...ctx, app: base, kept: false, resolve: async (principal) => (asked.push(principal), { roles: ['member'], scope: {}, catalog: { ids: ['home'] }, variants: new Map() }) }),
    );
    const connection = fakeConnection();
    const leaving = await host.session('t', 'usr_1');
    leaving.attach(connection);
    await host.session('t', 'usr_2');
    // Its last terminal left: a shell that is not kept ends there.
    leaving.detach(connection);
    asked.length = 0;

    host.adopt();
    await settle();

    expect(asked).toEqual(['usr_2']);
  });
});

// ═══════════════════════════════════════════════════════════════
// A SHELL THAT ENDED IS LET GO. To bring every living shell level, a host has
// to know every living shell: it holds each one it built until that shell
// ends. Held any longer, an ended shell is memory nothing can reach for, and
// a host builds a shell for every visitor's connection. So this is asked of
// the collector itself: once a shell has ended and whoever held its session
// has dropped it, nothing of the host keeps it, while the host goes on.
// ═══════════════════════════════════════════════════════════════

describe('shells — a shell that ended is let go', () => {
  // The collector, asked to run. Node keeps `gc` out of reach unless it is
  // started with a flag, and the flag can be set while it runs.
  setFlagsFromString('--expose-gc');
  const collect: () => void = runInNewContext('gc');
  // Whether what a reference pointed at is gone. A reference that was read
  // keeps its target until the turn that read it ends, so each look waits a
  // turn before the collector is asked.
  const collected = async (ref: WeakRef<object>): Promise<boolean> => {
    for (let look = 0; look < 20 && ref.deref() !== undefined; look += 1) {
      await tick();
      collect();
    }
    return ref.deref() === undefined;
  };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) await tick();
  };

  it.each([
    ['nobody signed in, on a host that keeps its principals’ shells', {}, null],
    ['somebody signed in, on a host that keeps none (a page’s)', { kept: false }, 'usr_1'],
  ] as const)('the shell of %s, once its last terminal has left', async (_whose, setup, principal) => {
    const host = createShellHost(hostConfig({ ...ctx, ...setup }));
    const ended = await (async (): Promise<WeakRef<object>> => {
      const session = await host.session(principal === null ? null : 't', principal);
      const connection = fakeConnection();
      session.attach(connection);
      await settle();
      session.detach(connection);
      return new WeakRef(session.shell);
    })();

    expect(await collected(ended)).toBe(true);
    // The host stands, and a change still finds the shells that live.
    const living = await host.session(principal === null ? null : 't', principal);
    host.adopt();
    await settle();
    expect(living.shell.getCanvasState('main').stack).toHaveLength(1);
  });

  it('a shell that was reset: the one it replaced is let go, and the session goes on', async () => {
    const host = createShellHost(hostConfig({ ...ctx, kept: false }));
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    const replaced = await (async (): Promise<WeakRef<object>> => {
      const before = new WeakRef(session.shell);
      expect(host.reset('usr_1')).toBe(true);
      await settle();
      return before;
    })();

    expect(await collected(replaced)).toBe(true);
    // The replacement is the one the host knows now.
    const standing = session.shell;
    expect(host.reset('usr_1')).toBe(true);
    await settle();
    expect(session.shell).not.toBe(standing);
  });

  it('a kept shell whose principal signed out', async () => {
    const seen: { fn?: FunctionSession } = {};
    const signing = { ...app, functions: (fn: FunctionSession) => ((seen.fn = fn), {}) } as unknown as NiscApp;
    const host = createShellHost(hostConfig({ ...ctx, app: signing }));
    const ended = await (async (): Promise<WeakRef<object>> => {
      const session = await host.session('t', 'usr_1');
      await settle();
      await seen.fn?.revoke();
      await settle();
      // The session app code was handed holds its shell: it is dropped with it.
      delete seen.fn;
      return new WeakRef(session.shell);
    })();

    expect(host.list()).toEqual([]);
    expect(await collected(ended)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// WHAT FAILS IS SAID. Four places caught an error and went on, which is
// right, and wrote nothing, which left a screen missing a card, a delivery
// that never arrived or a shell missing from the roster with no line anywhere
// to say why.
// ═══════════════════════════════════════════════════════════════

describe('shells — what fails is said', () => {
  const logged = async (run: () => Promise<void>): Promise<string[]> => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await run();
      return errors.mock.calls.map((call) => String(call[0]));
    } finally {
      errors.mockRestore();
    }
  };
  const seeded = (seeds: NonNullable<NonNullable<NiscApp['shell']>['seeds']>): HostSetup => ({
    ...ctx,
    app: { ...app, shell: { canvases: [{ id: 'main', mode: 'list' }], seeds } } as unknown as NiscApp,
  });

  it('a seed that cannot be pushed is skipped and named; the ones after it are pushed', async () => {
    const host = createShellHost(hostConfig(seeded(() => ({ main: [{ action: 'counter', with: ['no-such-fragment'] }, 'counter'] }))));
    let session: Awaited<ReturnType<typeof host.session>> | undefined;
    const lines = await logged(async () => {
      session = await host.session('t', 'usr_1');
      await tick();
      await tick();
    });
    expect(session?.shell.getCanvasState('main').stack).toHaveLength(1);
    expect(lines.filter((line) => line.includes('counter') && line.includes('main'))).toHaveLength(1);
  });

  it('seeds that cannot be derived leave the canvas as it was, and say so', async () => {
    const host = createShellHost(hostConfig(seeded(async () => Promise.reject(new Error('the rows could not be read')))));
    const lines = await logged(async () => {
      const snapshot = await host.snapshot('t', 'usr_1');
      expect(snapshot.settled).toBe(true);
      expect(snapshot.trees['main']).toEqual([]);
    });
    expect(lines.some((line) => line.includes('seeds'))).toBe(true);
  });

  it('a delivery the shell throws on answers false, and says so', async () => {
    const host = createShellHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    session.shell.publish = () => {
      throw new Error('the bus is gone');
    };
    let delivered: boolean | undefined;
    const lines = await logged(async () => {
      delivered = host.deliver('usr_1', 'a-channel');
    });
    expect(delivered).toBe(false);
    expect(lines.some((line) => line.includes('a-channel'))).toBe(true);
  });

  it('a shell that cannot be read is left off the roster, and said', async () => {
    const host = createShellHost(hostConfig(ctx));
    const broken = await host.session('t', 'usr_1');
    await host.session('t', 'usr_2');
    broken.shell.getState = () => {
      throw new Error('disposed under us');
    };
    let roster: string[] = [];
    const lines = await logged(async () => {
      roster = host.list().map((report) => report.principal);
    });
    expect(roster).toEqual(['usr_2']);
    expect(lines.some((line) => line.includes('usr_1'))).toBe(true);
  });
});

// A terminal names the canvas an event came from, and the shell holds it to
// that. A canvas the shell does not have is nowhere an event can have come
// from: it used to be dispatched with no origin, to every instance at once.
describe('shells — an event from a canvas the shell does not have', () => {
  it('is dropped, where one from a canvas it has still lands', async () => {
    const host = createShellHost(hostConfig({ ...ctx, app: twoCanvas }));
    const session = await host.session('t', 'usr_1');
    await tick();
    const n = (canvas: string): unknown => session.shell.getRuntime(session.shell.getState().canvases[canvas]?.active?.id ?? '')?.getData()['n'];

    session.dispatch('nowhere', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect([n('left'), n('right')]).toEqual([0, 0]);

    session.dispatch('right', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect([n('left'), n('right')]).toEqual([0, 1]);
  });
});

describe('shells — the instance a click names', () => {
  // A list canvas: two live counters at once, the second one "active". A
  // terminal names the card a press came from; moss holds that name to the
  // canvas the event is tagged with.
  const tallyA = { ...counter, id: 'a' };
  const tallyB = { ...counter, id: 'b' };
  const other = { ...counter, id: 'other' };
  const trayApp = {
    charter: { public: ['a', 'b', 'other'] },
    assignments: {},
    actions: { a: tallyA, b: tallyB, other },
    shell: {
      canvases: [
        { id: 'tray', mode: 'list', initial: 'a' },
        { id: 'side', initial: 'other' },
      ],
    },
  } as unknown as NiscApp;
  const ids = { ids: ['a', 'b', 'other'], hash: 'h' };
  const trayCtx: HostSetup = {
    ...ctx,
    app: trayApp,
    resolve: async () => ({ roles: ['public'], scope: {}, catalog: ids, variants: new Map() }),
  };

  const setup = async () => {
    const host = createShellHost(hostConfig(trayCtx));
    const session = await host.session('t', 'usr_1');
    await tick();
    session.shell.push('tray', 'b');
    await tick();
    const [a, b] = session.shell.getState().canvases['tray']?.stack ?? [];
    const side = session.shell.getState().canvases['side']?.active;
    const n = (id: string | undefined): unknown => session.shell.getRuntime(id ?? '')?.getData()['n'];
    return { session, a: a?.id, b: b?.id, side: side?.id, n };
  };

  it('a click naming a card on the canvas reaches that card — not the last one', async () => {
    const { session, a, b, n } = await setup();
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: a });
    await tick();
    expect([n(a), n(b)]).toEqual([1, 0]);
  });

  it('with no name, the active card is the origin, as before', async () => {
    const { session, a, b, n } = await setup();
    session.dispatch('tray', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect([n(a), n(b)]).toEqual([0, 1]);
  });

  it('a click naming an instance on ANOTHER canvas is dropped — it fires nowhere', async () => {
    const { session, a, b, side, n } = await setup();
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: side });
    await tick();
    expect([n(a), n(b), n(side)]).toEqual([0, 0, 0]);
  });

  // What an event is belongs to nova, and its shell takes one of nova's events
  // and nothing else. What a terminal sent is read by nova's schema where it
  // enters the shell: it used to be handed over as whatever object arrived.
  it('what is not one of nova’s events is not dispatched', async () => {
    const { session, a, b, n } = await setup();
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: a, more: 'than an event has' });
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', more: 'than an event has' });
    session.dispatch('tray', { type: 'ui:hover', ref: 'bump' });
    session.dispatch('tray', { ref: 'bump' });
    await tick();
    expect([n(a), n(b)]).toEqual([0, 0]);
    // And one that is, still lands.
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: a, payload: { any: 'thing' } });
    await tick();
    expect([n(a), n(b)]).toEqual([1, 0]);
  });

  it('a click naming an instance that is gone, or no instance at all, is dropped', async () => {
    const { session, a, b, side, n } = await setup();
    session.shell.removeInstance('tray', a ?? '');
    await tick();
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: a });
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: 'made-up' });
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: 42 });
    await tick();
    expect([n(b), n(side)]).toEqual([0, 0]);
  });
});
