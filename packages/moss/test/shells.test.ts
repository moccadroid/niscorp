import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { applyDelta, frameHash } from '../src/protocol';
import type { DeltaOp } from '../src/protocol';
import { hostConfig, standHost } from './shell-host-double';
import type { HostSetup } from './shell-host-double';
import type { ActionFragment, LayoutNode } from '@niscorp/nova';
import type { FunctionSession, NiscApp } from '../src/manifest';
import { unverifiedShell } from '../src/shells/unverified';
import type { Connection } from '../src/socket';
import { turn } from './turn';

const tick = turn;

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
    const host = standHost(hostConfig(ctx));
    const a = await host.session('t', 'usr_1');
    const b = await host.session('t', 'usr_1');
    expect(a.shell).toBe(b.shell);
  });

  it('who somebody is and what they hold is asked once for each shell that is built', async () => {
    const asked: (string | null)[] = [];
    const host = standHost(hostConfig({ ...ctx, resolve: async (principal) => (asked.push(principal), ctx.resolve(principal)) }));
    await host.session('t', 'usr_1');
    await host.session(null, null);
    await host.snapshot(null, null);
    expect(asked).toEqual(['usr_1', null, null]);
    await host.session('t', 'usr_1');
    await host.snapshot('t', 'usr_1');
    expect(asked).toHaveLength(3);
  });

  it('a different principal is a different shell', async () => {
    const host = standHost(hostConfig(ctx));
    expect((await host.session('t', 'usr_1')).shell).not.toBe((await host.session('t', 'usr_2')).shell);
  });

  it('anonymous sessions are ephemeral (a fresh shell each time)', async () => {
    const host = standHost(hostConfig(ctx));
    expect((await host.session(null, null)).shell).not.toBe((await host.session(null, null)).shell);
  });

  it('dispatch(canvas, event) stamps the active instance as origin — the event is delivered', async () => {
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    await tick();
    const active = session.shell.getState().canvases['main']?.active;
    expect(active).toBeDefined();
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
  });

  it('an ungranted initial does not mount (ring 1)', async () => {
    const host = standHost(hostConfig({ ...ctx, resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: [], hash: 'h' }, variants: new Map() }) }));
    const session = await host.session('t', 'usr_1');
    expect(session.shell.getState().canvases['main']?.active).toBeUndefined();
  });

  it('a held variant replaces the definition layout; behavior is untouched (ring 2)', async () => {
    const withLayouts = {
      ...app,
      actions: { counter: { ...counter, layout: { component: 'Text', children: 'base' } } },
      layouts: { 'counter.basic': { action: 'counter', layout: { component: 'Text', children: 'variant' } } },
    } as unknown as NiscApp;
    const rendered = async (principal: string, held: boolean): Promise<string> => {
      const host = standHost(hostConfig({
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

    const host = standHost(hostConfig({
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
    const host = standHost(hostConfig(setup));
    const [first, second, read] = await Promise.all([host.session('t', 'usr_1'), host.session('t', 'usr_1'), host.snapshot('t', 'usr_1')]);
    expect(first.shell).toBe(second.shell);
    expect(built()).toBe(1);
    expect(host.list()).toHaveLength(1);
    expect(read.trees['main']).toBeDefined();
    expect((await host.session('t', 'usr_1')).shell).toBe(first.shell);
    expect(built()).toBe(1);
  });

  it('somebody else arriving in the same moment gets a shell of their own', async () => {
    const { setup, built } = counted();
    const host = standHost(hostConfig(setup));
    const [mine, theirs] = await Promise.all([host.session('t', 'usr_1'), host.session('t', 'usr_2')]);
    expect(mine.shell).not.toBe(theirs.shell);
    expect(built()).toBe(2);
  });

  it('a build that fails is refused to both, keeps nothing, and the next arrival builds afresh', async () => {
    let broken = true;
    const host = standHost(
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
    await standHost(hostConfig({ ...ctx, ...extra, app: withFunctions })).session(principal === null ? null : 't', principal);
    if (seen.session === undefined) throw new Error('the functions seam was not called');
    return seen.session;
  };
  const writers = { generateDsl: async () => ({ from: ['notes'] }), mapToShape: async () => ({ ir: {}, transformed: null }) } as unknown as Parameters<FunctionSession['answerIntent']>[0];
  const asked = { intent: 'every note', shape: [] };

  it('holds the functions its principal’s roles grant, and names them; the shell is handed those alone', async () => {
    const seen: { session?: FunctionSession } = {};
    const withFunctions = {
      ...app,
      functions: (session: FunctionSession) => {
        seen.session = session;
        return { 'notes.list': async () => ['a note'], 'notes.delete': async () => undefined };
      },
    } as unknown as NiscApp;
    const config = hostConfig({ ...ctx, app: withFunctions });
    await standHost({
      ...config,
      composition: async (principal) => ({ ...(await config.composition(principal)), grantedFunctions: (names) => new Set(names.filter((name) => name === 'notes.list')) }),
    }).session('t', 'usr_1');

    expect(seen.session?.functions()).toEqual(['notes.list']);
  });

  it('the functions it holds follow the roles an adopt answers, as its actions do', async () => {
    const seen: { session?: FunctionSession } = {};
    const withFunctions = {
      ...app,
      functions: (session: FunctionSession) => {
        seen.session = session;
        return { 'notes.list': async () => ['a note'], 'notes.delete': async () => undefined };
      },
    } as unknown as NiscApp;
    const config = hostConfig({ ...ctx, app: withFunctions });
    const granting = { names: ['notes.list'] };
    const host = standHost({
      ...config,
      composition: async (principal) => ({ ...(await config.composition(principal)), grantedFunctions: (names) => new Set(names.filter((name) => granting.names.includes(name))) }),
    });
    await host.session('t', 'usr_1');
    expect(seen.session?.functions()).toEqual(['notes.list']);

    granting.names = ['notes.delete'];
    host.adopt();
    for (let i = 0; i < 4; i += 1) await tick();

    expect(seen.session?.functions()).toEqual(['notes.delete']);
  });

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

const answeredByHand = (first: readonly string[]) => {
  const held = { ids: first, asked: 0 };
  const unanswered: (() => void)[] = [];
  const told: { count: number; tell: () => void }[] = [];
  const resolve: HostSetup['resolve'] = async () => {
    const ids = held.ids;
    held.asked += 1;
    for (const one of told.splice(0)) {
      if (one.count <= held.asked) one.tell();
      else told.push(one);
    }
    if (held.asked > 1) await new Promise<void>((answer) => unanswered.push(answer));
    return { roles: ['public'], scope: {}, catalog: { ids }, variants: new Map() };
  };
  return {
    resolve,
    hold: (ids: readonly string[]): void => void (held.ids = ids),
    asked: (): number => held.asked,
    askedBy: (count: number): Promise<void> => (held.asked >= count ? Promise.resolve() : new Promise<void>((tell) => told.push({ count, tell }))),
    answer: (): void => unanswered.shift()?.(),
  };
};

const servedTerminal = () => {
  const connection = fakeConnection();
  const count = { served: 0 };
  const told: { count: number; tell: () => void }[] = [];
  return {
    ...connection,
    send: (text: string): void => {
      connection.send(text);
      if (connection.sent.at(-1)?.['type'] !== 'frame') return;
      count.served += 1;
      for (const one of told.splice(0)) {
        if (one.count <= count.served) one.tell();
        else told.push(one);
      }
    },
    servedBy: (wanted: number): Promise<void> => (count.served >= wanted ? Promise.resolve() : new Promise<void>((tell) => told.push({ count: wanted, tell }))),
  };
};

describe('shells — reset', () => {
  it('builds a new shell and the session addresses it (the old state is gone)', async () => {
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    await tick();
    const before = session.shell;
    const active = before.getState().canvases['main']?.active;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(before.getRuntime(active!.id)?.getData()['n']).toBe(1);

    session.reset();
    await tick();

    expect(session.shell).not.toBe(before);
    const fresh = session.shell.getState().canvases['main']?.active;
    expect(fresh).toBeDefined();
    expect(session.shell.getRuntime(fresh!.id)?.getData()['n']).toBe(0);

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(fresh!.id)?.getData()['n']).toBe(1);
  });

  it('carries attached connections across — every terminal is served a fresh frame and trees', async () => {
    const host = standHost(hostConfig(ctx));
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

    for (const connection of [a, b]) {
      expect(connection.sent[0]?.['type']).toBe('frame');
      expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
      expect(connection.closes).toEqual([]);
    }
  });

  it('the durable map holds the replacement — a later connection joins it, not the disposed one', async () => {
    const host = standHost(hostConfig(ctx));
    const first = await host.session('t', 'usr_1');
    await tick();
    first.reset();
    await tick();
    expect((await host.session('t', 'usr_1')).shell).toBe(first.shell);
  });

  it('resets that overlap leave every terminal on the shell that is kept', async () => {
    const host = standHost(hostConfig({ ...ctx, app: wide }));
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
    connection.sent.length = 0;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
  });

  it('two resets happen in turn: the second reads what it builds from once the first has landed, and its shell stands', async () => {
    const extra = { id: 'extra', data: {} };
    const who = answeredByHand(['counter']);
    const host = standHost(hostConfig({ ...ctx, app: { ...app, actions: { counter, extra } } as unknown as NiscApp, resolve: who.resolve }));
    const session = await host.session('t', 'usr_1');
    const terminal = servedTerminal();
    session.attach(terminal);
    await terminal.servedBy(1);

    session.reset();
    await who.askedBy(2);
    who.hold(['counter', 'extra']);
    session.reset();

    who.answer();
    await terminal.servedBy(2);
    expect(who.asked()).toBe(2);
    expect(() => session.shell.push('main', 'extra')).toThrow();

    await who.askedBy(3);
    who.answer();
    await terminal.servedBy(3);
    expect(session.shell.push('main', 'extra')).toEqual(expect.any(String));
    expect(host.list()).toEqual([expect.objectContaining({ principal: 'usr_1', connections: 1 })]);
    expect(terminal.closes).toEqual([]);
  });

  it('a shell that ended while its replacement was being built is not replaced', async () => {
    const who = answeredByHand(['counter']);
    const session = await standHost(hostConfig({ ...ctx, resolve: who.resolve })).session(null, null);
    const connection = fakeConnection();
    session.attach(connection);
    const stood = session.shell;

    session.reset();
    await who.askedBy(2);
    session.detach(connection);
    who.answer();
    await tick();

    expect(session.shell).toBe(stood);
    expect(() => session.shell.push('main', 'counter')).toThrow();
  });

  it('a reset asked of a shell that has already ended builds nothing', async () => {
    const who = answeredByHand(['counter']);
    const session = await standHost(hostConfig({ ...ctx, resolve: who.resolve })).session(null, null);
    const connection = fakeConnection();
    session.attach(connection);
    const stood = session.shell;
    session.detach(connection);

    session.reset();
    await tick();

    expect(who.asked()).toBe(1);
    expect(session.shell).toBe(stood);
  });

  it('a shell that is reset is rebuilt with what it was opened with: its inputs and its id seed', async () => {
    const words = { id: 'words', data: { slug: '' }, layout: { component: 'Text', children: '$.slug' } };
    const paged = { ...app, actions: { words } } as unknown as NiscApp;
    const page = { canvases: [{ id: 'main', initial: 'words' }] };
    const host = standHost(
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
    const host = standHost(hostConfig(ctx));
    expect(host.reset('usr_nobody')).toBe(false);
    await host.session('t', 'usr_1');
    expect(host.reset('usr_1')).toBe(true);
  });

  it('reaches every living shell of the principal on a host that keeps none, and nobody else’s', async () => {
    const host = standHost(hostConfig({ ...ctx, kept: false }));
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
    for (const connection of connections) {
      expect(connection.sent[0]?.['type']).toBe('frame');
      expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
      expect(connection.closes).toEqual([]);
    }
  });

  it('a shell that ended is not one a reset finds', async () => {
    const host = standHost(hostConfig({ ...ctx, kept: false }));
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    expect(host.reset('usr_nobody')).toBe(false);
    session.detach(connection);
    expect(host.reset('usr_1')).toBe(false);
  });

  it('a reset that cannot build leaves the old shell standing — never nothing at all', async () => {
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

    const host = standHost(hostConfig({ ...ctx, app: withInputs }));
    const session = await host.session('t', 'usr_1');
    await tick();
    const before = session.shell;
    const connection = fakeConnection();
    session.attach(connection);

    broken = true;
    // The rebuild is asynchronous: reset answers at once and the replacement lands a tick later,
    // so the failure surfaces on the console.
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    session.reset();
    await tick();
    console.error = original;
    expect(errors.length).toBeGreaterThan(0);

    expect(session.shell).toBe(before);
    expect(host.list()[0]?.connections).toBe(1);
    connection.sent.length = 0;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(before.getState().canvases['main']?.active).toBeDefined();
  });
});

const outcomeOf = (call: Promise<unknown>): { state: 'waiting' | 'served' | 'refused' } => {
  const outcome: { state: 'waiting' | 'served' | 'refused' } = { state: 'waiting' };
  call.then(
    () => void (outcome.state = 'served'),
    () => void (outcome.state = 'refused'),
  );
  return outcome;
};

const neverAnsweredFor =
  (stuck: ReadonlySet<string>): HostSetup['resolve'] =>
  async (principal) => {
    if (principal !== null && stuck.has(principal)) await new Promise<never>(() => undefined);
    return ctx.resolve(principal);
  };

describe('shells — a build is bounded by the endpoint timeout', () => {
  const TIMEOUT = 2_000;
  const clocked = async (run: (pass: (ms: number) => Promise<void>) => Promise<void>): Promise<void> => {
    vi.useFakeTimers();
    try {
      await run(async (ms) => void (await vi.advanceTimersByTimeAsync(ms)));
    } finally {
      vi.useRealTimers();
    }
  };

  it('a first build that never lands is refused at the timeout to whoever waited on it; their next arrival, snapshot and reset are served, and nobody else waited', () =>
    clocked(async (pass) => {
      const stuck = new Set(['usr_1']);
      const host = standHost(hostConfig({ ...ctx, endpointTimeoutMs: TIMEOUT, resolve: neverAnsweredFor(stuck) }));
      const waited = [host.session('t', 'usr_1'), host.session('t', 'usr_1'), host.snapshot('t', 'usr_1')].map(outcomeOf);
      const theirs = outcomeOf(host.session('t', 'usr_2'));

      await pass(TIMEOUT - 1);
      expect(theirs.state).toBe('served');
      expect(waited.map((call) => call.state)).toEqual(['waiting', 'waiting', 'waiting']);
      await pass(1);
      expect(waited.map((call) => call.state)).toEqual(['refused', 'refused', 'refused']);
      expect(host.list().map((shell) => shell.principal)).toEqual(['usr_2']);

      stuck.clear();
      const session = await host.session('t', 'usr_1');
      expect(session.shell.getState().canvases['main']?.active).toBeDefined();
      const read = outcomeOf(host.snapshot('t', 'usr_1'));
      await pass(TIMEOUT - 1);
      expect(read.state).toBe('served');
      expect(host.reset('usr_1')).toBe(true);
      host.stop();
    }));

  it('a reset whose build never lands holds up no later reset of that shell beyond the timeout, and nobody else’s at all', () =>
    clocked(async (pass) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const stuck = new Set<string>();
        const host = standHost(hostConfig({ ...ctx, app: wide, endpointTimeoutMs: TIMEOUT, resolve: neverAnsweredFor(stuck) }));
        const session = await host.session('t', 'usr_1');
        const theirs = await host.session('t', 'usr_2');
        const connection = fakeConnection();
        session.attach(connection);
        await pass(0);
        const stood = { mine: session.shell, theirs: theirs.shell };

        stuck.add('usr_1');
        session.reset();
        await pass(0);
        stuck.clear();

        expect(host.reset('usr_2')).toBe(true);
        await pass(0);
        expect(theirs.shell).not.toBe(stood.theirs);
        expect(host.reset('usr_1')).toBe(true);
        session.reset();
        await pass(TIMEOUT);
        expect(session.shell).not.toBe(stood.mine);
        expect(host.list().find((shell) => shell.principal === 'usr_1')?.connections).toBe(1);
        connection.sent.length = 0;
        session.dispatch('main', { type: 'ui:click', ref: 'bump' });
        await pass(0);
        expect(connection.sent.some((m) => m['type'] === 'render' && m['canvas'] === 'main')).toBe(true);
        expect(connection.closes).toEqual([]);
        expect(errors.mock.calls.some((call) => String(call[0]).includes('a reset failed to rebuild'))).toBe(true);
        host.stop();
      } finally {
        errors.mockRestore();
      }
    }));

  it.each([
    ['who its principal is', 'composition'],
    ['their `inputs`', 'inputs'],
  ] as const)('a build that hears %s after its time ran out runs none of the app’s code after that, and is kept by nothing', (_what, hangs) =>
    clocked(async (pass) => {
      const ran: string[] = [];
      const answers: (() => void)[] = [];
      const answering = { byHand: true };
      const answered = (at: string): Promise<void> => (answering.byHand && at === hangs ? new Promise<void>((answer) => void answers.push(answer)) : Promise.resolve());
      const counting = {
        ...app,
        functions: () => (ran.push('functions'), {}),
        onSession: () => void ran.push('onSession'),
        shell: {
          canvases: [{ id: 'main', initial: 'counter' }],
          inputs: async () => (ran.push('inputs'), await answered('inputs'), {}),
          seeds: () => (ran.push('seeds'), {}),
        },
      } as unknown as NiscApp;
      const host = standHost(
        hostConfig({ ...ctx, app: counting, endpointTimeoutMs: TIMEOUT, resolve: async (principal) => (await answered('composition'), ctx.resolve(principal)) }),
      );
      const arriving = outcomeOf(host.session('t', 'usr_1'));
      await pass(TIMEOUT);
      expect(arriving.state).toBe('refused');
      const ranInTime = [...ran];

      answers[0]?.();
      await pass(0);
      expect(ran).toEqual(ranInTime);
      expect(host.list()).toEqual([]);

      answering.byHand = false;
      await host.session('t', 'usr_1');
      expect(ran.slice(ranInTime.length)).toEqual(['inputs', 'functions', 'onSession', 'seeds']);
      expect(host.list()).toHaveLength(1);
      host.stop();
    }));
});

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
    const host = standHost(hostConfig(twoCtx));
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
    const served = conn.sent.filter((m) => m['type'] === 'render' && m['canvas'] === 'main').at(-1);
    expect(JSON.stringify(served)).toContain('the register');
    expect(JSON.stringify(served)).not.toContain('one person');
  });

  it('cannot undo the landing screen — a seeded canvas is the floor', async () => {
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    await tick();

    expect(session.back()).toBe(false);
    expect(session.shell.getCanvasState('main').stack).toHaveLength(1);
  });

  it('reads through the cell — a reset session backs the shell standing now', async () => {
    const host = standHost(hostConfig(ctx));
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
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    await host.session(null, null);
    await tick();

    expect(host.list().map((s) => s.principal)).toEqual(['usr_1']);
    expect(host.list()[0]?.canvases).toEqual([{ id: 'main', actions: ['counter'] }]);
    expect(host.list()[0]?.connections).toBe(0);
    expect(host.list()[0]?.idleSince).not.toBeNull();

    const connection = fakeConnection();
    session.attach(connection);
    expect(host.list()[0]?.connections).toBe(1);
    expect(host.list()[0]?.idleSince).toBeNull();

    session.detach(connection);
    expect(host.list()[0]?.connections).toBe(0);
    expect(host.list()[0]?.idleSince).not.toBeNull();
  });

  it('a signed-out shell leaves the roster at once, not when somebody next looks', async () => {
    const host = standHost(hostConfig(ctx));
    await host.session('t', 'usr_1');
    await tick();
    expect(host.list()).toHaveLength(1);
    host.reset('usr_1');
    expect(host.list()).toHaveLength(1);
  });
});

describe('shells — the idle sweep', () => {
  it('disposes a shell nothing has been attached to for idleMs; the next connect rebuilds', async () => {
    vi.useFakeTimers();
    try {
      const host = standHost(hostConfig({ ...ctx, idleMs: 1000 }));
      const session = await host.session('t', 'usr_1');
      const before = session.shell;
      await vi.advanceTimersByTimeAsync(0);

      const connection = fakeConnection();
      session.attach(connection);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(host.list()).toHaveLength(1);

      session.detach(connection);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(host.list()).toHaveLength(0);

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
      const host = standHost(hostConfig({ ...ctx, idleMs: 0 }));
      await host.session('t', 'usr_1');
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(host.list()).toHaveLength(1);
      host.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

// The layout renders `n`: the host sends only a canvas whose tree changed.
const twoCanvas = {
  ...app,
  actions: { counter: { ...counter, layout: { component: 'Text', children: '$.n' } } },
  shell: { canvases: [{ id: 'left', initial: 'counter' }, { id: 'right', initial: 'counter' }] },
} as unknown as NiscApp;

// Big enough that one changed number is a small part of it: smaller frames are sent whole.
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

const textConnection = (): Connection & { texts: string[] } => {
  const texts: string[] = [];
  return { texts, send: (text) => void texts.push(text), close: () => {}, onMessage: () => {}, onClose: () => {} };
};

const lastOfType = (texts: string[], type: string): Record<string, unknown> | undefined =>
  texts.map((t) => JSON.parse(t) as Record<string, unknown>).filter((m) => m['type'] === type).at(-1);

describe('shells — frame deltas', () => {
  it('a delta rebuilds the exact frame a whole-frame terminal was sent', async () => {
    const host = standHost(hostConfig({ ...ctx, app: wide, delta: true }));
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    const silent = textConnection();
    session.attach(asked, { delta: true });
    session.attach(silent);
    await tick();

    const base = asked.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1);
    expect(base).toBeDefined();
    asked.texts.length = 0;
    silent.texts.length = 0;

    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();

    const delta = lastOfType(asked.texts, 'render-delta');
    expect(delta).toBeDefined();
    const whole = silent.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1);
    expect(whole).toBeDefined();
    expect(lastOfType(silent.texts, 'render-delta')).toBeUndefined();

    const rebuilt = applyDelta(base!, delta!['ops'] as DeltaOp[]);
    expect(rebuilt).toBe(whole);
    expect(delta!['hash']).toBe(frameHash(whole!));
    expect(delta!['canvas']).toBe('main');
    expect(JSON.stringify(delta).length).toBeLessThan(whole!.length * 0.6);
  });

  it('deltas chain — each one is written against the last frame, not the first', async () => {
    const host = standHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
    const host = standHost(hostConfig({ ...ctx, app: wide }));
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
    const host = standHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
    expect(session.shell).toBe(shell);

    const base = asked.texts.filter((t) => (JSON.parse(t) as { type: string }).type === 'render').at(-1)!;
    asked.texts.length = 0;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    const delta = lastOfType(asked.texts, 'render-delta');
    expect(delta).toBeDefined();
    expect(frameHash(applyDelta(base, delta!['ops'] as DeltaOp[]))).toBe(delta!['hash']);
  });

  it('a reset carries the capability across — the replacement still deltas', async () => {
    const host = standHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
    const host = standHost(hostConfig({ ...ctx, app: padded, delta: true }));
    const session = await host.session('t', 'usr_1');
    const asked = textConnection();
    const silent = textConnection();
    session.attach(asked, { delta: true });
    session.attach(silent);
    await tick();

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

    const grown = await sentFor({ type: 'ui:click', ref: 'pad', payload: 'x'.repeat(70 * 1024) });
    expect(grown.length).toBeGreaterThan(64 * 1024);
    expect(grown.type).toBe('render');
    expect((await sentFor({ type: 'ui:click', ref: 'bump' })).type).toBe('render');
    const shrunk = await sentFor({ type: 'ui:click', ref: 'pad', payload: '' });
    expect(shrunk.length).toBeLessThan(64 * 1024);
    expect(shrunk.type).toBe('render');
    expect((await sentFor({ type: 'ui:click', ref: 'bump' })).type).toBe('render-delta');
  });

  it('a detached connection is forgotten by both sets', async () => {
    const host = standHost(hostConfig({ ...ctx, app: wide, delta: true }));
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
      const host = standHost(hostConfig({ ...ctx, app: twoCanvas }));
      const session = await host.session('t', 'usr_1');
      await tick();

      const shell = unverifiedShell(session) as unknown as { getCanvasRenderTree: (id: string) => unknown };
      const original = shell.getCanvasRenderTree.bind(shell);
      shell.getCanvasRenderTree = (id: string) => {
        if (id === 'left') throw new Error('a poisoned tree');
        return original(id);
      };

      const connection = fakeConnection();
      session.attach(connection);
      expect(connection.sent[0]?.['type']).toBe('frame');
      const canvases = connection.sent.filter((m) => m['type'] === 'render').map((m) => m['canvas']);
      expect(canvases).toEqual(['right']);

      connection.sent.length = 0;
      const active = session.shell.getState().canvases['right']?.active;
      session.dispatch('right', { type: 'ui:click', ref: 'bump' });
      await tick();
      expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
      expect(connection.sent.some((m) => m['canvas'] === 'right')).toBe(true);
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('reset is the way out — the replacement renders every canvas again', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const host = standHost(hostConfig({ ...ctx, app: twoCanvas }));
      const session = await host.session('t', 'usr_1');
      await tick();
      const shell = unverifiedShell(session) as unknown as { getCanvasRenderTree: (id: string) => unknown };
      shell.getCanvasRenderTree = () => {
        throw new Error('every canvas is poisoned');
      };

      const connection = fakeConnection();
      session.attach(connection);
      expect(connection.sent.filter((m) => m['type'] === 'render')).toHaveLength(0);

      connection.sent.length = 0;
      session.reset();
      await tick();

      const canvases = connection.sent.filter((m) => m['type'] === 'render').map((m) => m['canvas']);
      expect(canvases).toEqual(['left', 'right']);
    } finally {
      errors.mockRestore();
    }
  });
});

describe('shells — the canvases a shell has', () => {
  const canvasesSent = (conn: ReturnType<typeof fakeConnection>): unknown[] => conn.sent.filter((m) => m['type'] === 'render').map((m) => m['canvas']);

  it('a canvas added while the shell runs is served like the ones it was built with', async () => {
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    const first = fakeConnection();
    session.attach(first);
    await tick();
    first.sent.length = 0;

    unverifiedShell(session).addCanvas({ id: 'late', initial: { action: 'counter' } });
    await tick();
    await tick();

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
    const host = standHost(hostConfig(twoCtx));
    const session = await host.session('t', 'usr_1');
    const conn = fakeConnection();
    session.attach(conn);
    await tick();
    conn.sent.length = 0;

    unverifiedShell(session).removeCanvas('left');
    await tick();
    await tick();
    expect(conn.sent.filter((m) => m['type'] === 'render' && m['canvas'] === 'left')).toEqual([{ type: 'render', canvas: 'left', tree: [] }]);

    const later = fakeConnection();
    session.attach(later);
    expect(canvasesSent(later)).toEqual(['right']);
  });
});

describe('shells — the frame layout store and re-send', () => {
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
    const host = standHost(hostConfig(refCtx));
    const conn = fakeConnection();
    (await host.session('t', 'usr_1')).attach(conn);
    const frame = frames(conn).at(-1);
    expect(frame).toBeDefined();
    expect(JSON.stringify(frame)).toContain('seeded-dock');
  });

  it('setLayout re-sends the frame to attached terminals; an unchanged frame sends nothing', async () => {
    const host = standHost(hostConfig(refCtx));
    const conn = fakeConnection();
    const session = await host.session('t', 'usr_1');
    session.attach(conn);
    const afterAttach = frames(conn).length;

    unverifiedShell(session).setLayout('r', { component: 'Text', children: 'swapped-dock' });
    await tick();
    await tick();
    const afterSwap = frames(conn);
    expect(afterSwap.length).toBeGreaterThan(afterAttach);
    expect(JSON.stringify(afterSwap.at(-1))).toContain('swapped-dock');

    const settled = afterSwap.length;
    unverifiedShell(session).setLayout('r', { component: 'Text', children: 'swapped-dock' });
    await tick();
    await tick();
    expect(frames(conn).length).toBe(settled);
  });

  it('a terminal that attaches while the frame has changed does not leave the others on the old one', async () => {
    const host = standHost(hostConfig(refCtx));
    const session = await host.session('t', 'usr_1');
    const first = fakeConnection();
    session.attach(first);
    await tick();
    await tick();

    unverifiedShell(session).setLayout('r', { component: 'Text', children: 'swapped-dock' });
    const second = fakeConnection();
    session.attach(second);
    await tick();
    await tick();

    expect(JSON.stringify(frames(second).at(-1))).toContain('swapped-dock');
    expect(JSON.stringify(frames(first).at(-1))).toContain('swapped-dock');
    expect(frames(first).filter((frame) => JSON.stringify(frame).includes('swapped-dock'))).toHaveLength(1);
  });

  it('a frame that fails to render for a newcomer is not taken for the one everybody holds', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const host = standHost(hostConfig(refCtx));
      const session = await host.session('t', 'usr_1');
      const first = fakeConnection();
      session.attach(first);
      await tick();
      const held = frames(first).length;

      const render = session.shell.getShellRenderTree.bind(session.shell);
      unverifiedShell(session).getShellRenderTree = () => {
        throw new Error('the frame is poisoned, this once');
      };
      const second = fakeConnection();
      session.attach(second);
      expect(frames(second).at(-1)).toEqual({ type: 'frame', tree: [] });
      expect(frames(first)).toHaveLength(held);

      unverifiedShell(session).getShellRenderTree = render;
      session.dispatch('main', { type: 'ui:click', ref: 'bump' });
      await tick();
      await tick();
      expect(JSON.stringify(frames(second).at(-1))).toContain('seeded-dock');
    } finally {
      errors.mockRestore();
    }
  });

  it('a canvas-only change on a frame with no ref sends no frame message', async () => {
    const host = standHost(hostConfig(ctx));
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
    const host = standHost(hostConfig(nestedCtx));
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
    const host = standHost(hostConfig(nestedCtx));
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

describe('shells — adopt', () => {
  const home = { id: 'home', data: {}, layout: { component: 'Text', children: 'home' } };
  const extra = { id: 'extra', data: {}, layout: { component: 'Text', children: 'an extra screen' } };
  const ledger = { id: 'ledger', data: {}, layout: { component: 'Ledger', children: 'a ledger' } };
  const base = { ...app, actions: { home }, shell: { canvases: [{ id: 'main', initial: 'home' }] } } as unknown as NiscApp;

  const world = (setup: Partial<HostSetup> = {}): { host: ReturnType<typeof standHost>; force: (actions: Record<string, unknown>) => void; hold: (principal: string, ids: string[] | Error) => void } => {
    let inForce: Record<string, unknown> = { home, extra };
    const held = new Map<string, string[] | Error>();
    const host = standHost(
      hostConfig({
        ...ctx,
        ...setup,
        app: setup.app ?? base,
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
  const mounted = (session: Awaited<ReturnType<ReturnType<typeof standHost>['session']>>): string[] => session.shell.getCanvasState('main').stack.map((item) => item.definitionId);
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

      expect(() => first.shell.push('main', 'ledger')).toThrow();
      second.shell.push('main', 'ledger');
      expect(mounted(second)).toEqual(['home', 'ledger']);
      expect(errors.mock.calls.some((call) => String(call[0]).includes('usr_1'))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it('two changes are adopted in the order they happened, however long each answer takes', async () => {
    const answers: ((ids: string[]) => void)[] = [];
    let byHand = false;
    const host = standHost(
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

    host.adopt();
    host.adopt();
    await settle();
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

  const stuck = (): NiscApp => ({
    ...base,
    shell: { canvases: [{ id: 'main', initial: 'home' }], inputs: ({ principal }) => (principal === 'usr_stuck' ? new Promise<never>(() => undefined) : {}) },
  });

  it('a build that never lands holds no later change back from anybody else', async () => {
    const { host, force } = world({ app: stuck() });
    const session = await host.session('t', 'usr_1');
    // Refused when the endpoint timeout runs out, which nobody here waits for.
    host.session('t', 'usr_stuck').catch(() => undefined);
    await settle();

    force({ home, extra, ledger });
    host.adopt();
    await settle();
    session.shell.push('main', 'ledger');
    expect(mounted(session)).toEqual(['home', 'ledger']);

    force({ home });
    host.adopt();
    await settle();

    expect(mounted(session)).toEqual(['home']);
    expect(() => session.shell.push('main', 'extra')).toThrow();
    expect(() => session.shell.push('main', 'ledger')).toThrow();
  });

  it('nor does a build that fails', async () => {
    const failing: NiscApp = {
      ...base,
      shell: {
        canvases: [{ id: 'main', initial: 'home' }],
        inputs: ({ principal }) => (principal === 'usr_broken' ? Promise.reject(new Error('their inputs cannot be read')) : {}),
      },
    };
    const { host, force } = world({ app: failing });
    const session = await host.session('t', 'usr_1');
    const refused = host.session('t', 'usr_broken');
    force({ home });
    host.adopt();
    await expect(refused).rejects.toThrow('their inputs cannot be read');
    await settle();

    expect(() => session.shell.push('main', 'extra')).toThrow();
  });

  const neverAnswered = (who: string, setup: Partial<HostSetup> = {}): { host: ReturnType<typeof standHost>; change: (actions: Record<string, unknown>) => void } => {
    let inForce: Record<string, unknown> = { home, extra };
    let changed = false;
    const host = standHost(
      hostConfig({
        ...ctx,
        ...setup,
        app: base,
        actions: () => inForce as ReturnType<NonNullable<HostSetup['actions']>>,
        resolve: async (principal) => {
          if (changed && principal === who) await new Promise<never>(() => undefined);
          return { roles: ['member'], scope: {}, catalog: { ids: Object.keys(inForce) }, variants: new Map() };
        },
      }),
    );
    return {
      host,
      change: (actions) => {
        inForce = actions;
        changed = true;
      },
    };
  };

  it('a principal who is never answered holds up nobody after them, in that change', async () => {
    const { host, change } = neverAnswered('usr_stuck');
    const before = await host.session('t', 'usr_before');
    // Built before the two after it, so a walk reaches it before them.
    await host.session('t', 'usr_stuck');
    const after = await host.session('t', 'usr_after');
    const last = await host.session('t', 'usr_last');
    for (const session of [before, after, last]) session.shell.push('main', 'extra');
    await settle();

    change({ home, ledger });
    host.adopt();
    await settle();

    for (const session of [before, after, last]) {
      expect(mounted(session)).toEqual(['home']);
      session.shell.push('main', 'ledger');
      expect(mounted(session)).toEqual(['home', 'ledger']);
    }
  });

  it('nor on a host that keeps no shell, where every connection has its own', async () => {
    const { host, change } = neverAnswered('usr_stuck', { kept: false });
    await host.session('t', 'usr_stuck');
    const after = await host.session('t', 'usr_after');
    const nobody = await host.session(null, null);
    for (const session of [after, nobody]) session.shell.push('main', 'extra');
    await settle();

    change({ home });
    host.adopt();
    await settle();

    for (const session of [after, nobody]) {
      expect(mounted(session)).toEqual(['home']);
      expect(() => session.shell.push('main', 'extra')).toThrow();
    }
  });

  it('a build that was under way through two changes holds what is in force when it lands', async () => {
    let release = (): void => undefined;
    const waiting = new Promise<void>((resolve) => void (release = resolve));
    const slow: NiscApp = { ...base, shell: { canvases: [{ id: 'main', initial: 'home' }], inputs: async () => (await waiting, {}) } };
    const { host, force } = world({ app: slow });
    const arriving = host.session('t', 'usr_1');
    await settle();

    force({ home, extra, ledger });
    host.adopt();
    await settle();
    force({ home, ledger });
    host.adopt();
    await settle();
    release();
    const session = await arriving;
    await settle();

    expect(() => session.shell.push('main', 'extra')).toThrow();
    session.shell.push('main', 'ledger');
    expect(mounted(session)).toEqual(['home', 'ledger']);
  });

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

  it.each([
    ['a kept shell', {}],
    ['a shell that is not kept', { kept: false }],
  ] as const)('%s that was being replaced when the app changed adopts when its replacement lands', async (_which, setup) => {
    let waiting: Promise<void> | undefined;
    const slow = { ...base, shell: { canvases: [{ id: 'main', initial: 'home' }], inputs: async () => (await waiting, {}) } } as unknown as NiscApp;
    let inForce: Record<string, unknown> = { home, extra };
    const host = standHost(
      hostConfig({
        ...ctx,
        ...setup,
        app: slow,
        actions: () => inForce as ReturnType<NonNullable<HostSetup['actions']>>,
        resolve: async () => ({ roles: ['member'], scope: {}, catalog: { ids: Object.keys(inForce) }, variants: new Map() }),
      }),
    );
    const session = await host.session('t', 'usr_1');
    const stood = session.shell;
    let release = (): void => undefined;
    waiting = new Promise<void>((resolve) => void (release = resolve));

    session.reset();
    await settle();
    inForce = { home };
    host.adopt();
    await settle();
    release();
    await settle();

    expect(session.shell).not.toBe(stood);
    expect(() => session.shell.push('main', 'extra')).toThrow();
  });

  it('a shell whose replacement never lands adopts a change all the same', async () => {
    const hanging = { inputs: false };
    const slow: NiscApp = { ...base, shell: { canvases: [{ id: 'main', initial: 'home' }], inputs: () => (hanging.inputs ? new Promise<never>(() => undefined) : {}) } };
    const { host, force } = world({ app: slow });
    const session = await host.session('t', 'usr_1');
    session.shell.push('main', 'extra');
    await settle();
    const stood = session.shell;

    hanging.inputs = true;
    session.reset();
    await settle();
    force({ home, ledger });
    host.adopt();
    await settle();

    expect(session.shell).toBe(stood);
    expect(mounted(session)).toEqual(['home']);
    session.shell.push('main', 'ledger');
    expect(mounted(session)).toEqual(['home', 'ledger']);
  });

  describe('the shell’s own layouts', () => {
    const text = (children: string): LayoutNode => ({ component: 'Text', children });
    const framed = (name: string): LayoutNode => ({ component: 'Frame', props: { name }, children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }, { ref: 'dock' }, { ref: 'rail' }] });
    const sheet = (title: string): ActionFragment => ({ kind: 'fragment', id: 'sheet', layout: { component: 'Sheet', props: { title }, children: [{ slot: 'body' }] } });
    const layoutsWorld = () => {
      const answer = { frame: 'frame', layoutStore: { frame: framed('first'), dock: text('the dock, first'), rail: text('the rail, first') }, fragments: { sheet: sheet('first') } };
      const config = hostConfig({ ...ctx, app: base, resolve: async () => ({ roles: ['member'], scope: {}, catalog: { ids: ['home'] }, variants: new Map() }) });
      const host = standHost({
        ...config,
        composition: async (principal) => {
          const made = await config.composition(principal);
          return { ...made, ...structuredClone(answer), components: { ...made.components, Frame: {}, Sheet: {}, Text: {} } };
        },
      });
      return { host, answer };
    };
    const lastFrame = (connection: ReturnType<typeof fakeConnection>): string => JSON.stringify(connection.sent.filter((message) => message['type'] === 'frame').at(-1));

    it('the frame, a ref and a fragment that are answered differently after a change are put in place: the terminal is sent the frame, and the next push wears the fragment', async () => {
      const { host, answer } = layoutsWorld();
      const session = await host.session('t', 'usr_1');
      const connection = fakeConnection();
      session.attach(connection);
      await settle();
      expect(lastFrame(connection)).toContain('"name":"first"');

      answer.layoutStore.frame = framed('second');
      answer.layoutStore.dock = text('the dock, second');
      answer.fragments.sheet = sheet('second');
      host.adopt();
      await settle();

      expect(lastFrame(connection)).toContain('"name":"second"');
      expect(lastFrame(connection)).toContain('the dock, second');
      expect(lastFrame(connection)).toContain('the rail, first');
      session.shell.push('main', 'home', undefined, ['sheet']);
      await settle();
      expect(JSON.stringify(connection.sent.filter((message) => message['type'] === 'render').at(-1))).toContain('"title":"second"');
    });

    it('what is answered as it was is not put in place again: a ref the shell’s own code set since stands, and no frame is sent', async () => {
      const { host } = layoutsWorld();
      const session = await host.session('t', 'usr_1');
      const connection = fakeConnection();
      session.attach(connection);
      unverifiedShell(session).setLayout('dock', text('the dock, as this person arranged it'));
      await settle();
      const sent = connection.sent.length;

      host.adopt();
      await settle();

      expect(lastFrame(connection)).toContain('the dock, as this person arranged it');
      expect(connection.sent).toHaveLength(sent);
    });

    it('one ref is answered differently: that one is set, and another the shell’s own code set stands', async () => {
      const { host, answer } = layoutsWorld();
      const session = await host.session('t', 'usr_1');
      const connection = fakeConnection();
      session.attach(connection);
      unverifiedShell(session).setLayout('dock', text('the dock, as this person arranged it'));
      await settle();

      answer.layoutStore.rail = text('the rail, second');
      host.adopt();
      await settle();

      expect(lastFrame(connection)).toContain('the rail, second');
      expect(lastFrame(connection)).toContain('the dock, as this person arranged it');
      expect(lastFrame(connection)).toContain('"name":"first"');
    });
  });

  describe('a canvas the shell’s layouts hold a slot for', () => {
    const canvasesWorld = (slotted: string[] = []) => {
      const answer = { slotted };
      const config = hostConfig({ ...ctx, app: base, resolve: async () => ({ roles: ['member'], scope: {}, catalog: { ids: ['home'] }, variants: new Map() }) });
      const host = standHost({ ...config, composition: async (principal) => ({ ...(await config.composition(principal)), slottedCanvases: [...answer.slotted] }) });
      return { host, answer };
    };
    const canvasesOf = (session: Awaited<ReturnType<ReturnType<typeof standHost>['session']>>): string[] => Object.keys(session.shell.getState().canvases);
    const lastOn = (connection: ReturnType<typeof fakeConnection>, canvas: string): unknown => connection.sent.filter((message) => message['type'] === 'render' && message['canvas'] === canvas).at(-1);

    it('is nova’s to give the shell, when something is first pushed onto it; once no layout holds the slot it is taken out with what is mounted on it, and the others keep what is on them', async () => {
      const { host, answer } = canvasesWorld();
      const session = await host.session('t', 'usr_1');
      const connection = fakeConnection();
      session.attach(connection);
      await settle();
      const declared = canvasesOf(session);
      const open = session.shell.getCanvasState('main').stack.at(-1)?.id;

      answer.slotted = ['notes'];
      host.adopt();
      await settle();
      expect(canvasesOf(session)).toEqual(declared);
      session.shell.push('notes', 'home');
      await settle();
      expect(canvasesOf(session)).toEqual([...declared, 'notes']);

      host.adopt();
      await settle();
      expect(canvasesOf(session)).toEqual([...declared, 'notes']);

      answer.slotted = [];
      host.adopt();
      await settle();
      expect(canvasesOf(session)).toEqual(declared);
      expect(lastOn(connection, 'notes')).toEqual({ type: 'render', canvas: 'notes', tree: [] });
      expect(mounted(session)).toEqual(['home']);
      expect(session.shell.getCanvasState('main').stack.at(-1)?.id).toBe(open);
    });

    it('one a layout held the slot for when the shell was built is taken out the same way, and a canvas no layout ever held a slot for stays', async () => {
      const { host, answer } = canvasesWorld(['notes']);
      const session = await host.session('t', 'usr_1');
      await settle();
      const declared = canvasesOf(session);
      session.shell.push('notes', 'home');
      session.shell.push('theirs', 'home');
      await settle();
      expect(canvasesOf(session)).toEqual([...declared, 'notes', 'theirs']);

      answer.slotted = [];
      host.adopt();
      await settle();

      expect(canvasesOf(session)).toEqual([...declared, 'theirs']);
    });
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
    const host = standHost(
      hostConfig({ ...ctx, app: base, kept: false, resolve: async (principal) => (asked.push(principal), { roles: ['member'], scope: {}, catalog: { ids: ['home'] }, variants: new Map() }) }),
    );
    const connection = fakeConnection();
    const leaving = await host.session('t', 'usr_1');
    leaving.attach(connection);
    await host.session('t', 'usr_2');
    leaving.detach(connection);
    asked.length = 0;

    host.adopt();
    await settle();

    expect(asked).toEqual(['usr_2']);
  });
});

describe('shells — a shell that ended is let go', () => {
  // Node keeps `gc` out of reach unless it is started with a flag, which can be set while it runs.
  setFlagsFromString('--expose-gc');
  const collect: () => void = runInNewContext('gc');
  // A WeakRef that was read keeps its target until the turn that read it ends,
  // so each look waits a turn first.
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
    const host = standHost(hostConfig({ ...ctx, ...setup }));
    const ended = await (async (): Promise<WeakRef<object>> => {
      const session = await host.session(principal === null ? null : 't', principal);
      const connection = fakeConnection();
      session.attach(connection);
      await settle();
      session.detach(connection);
      return new WeakRef(session.shell);
    })();

    expect(await collected(ended)).toBe(true);
    const living = await host.session(principal === null ? null : 't', principal);
    host.adopt();
    await settle();
    expect(living.shell.getCanvasState('main').stack).toHaveLength(1);
  });

  it('a shell that is not kept and has not ended is held, and one that attached nothing is ended by a detach', async () => {
    const host = standHost(hostConfig(ctx));
    const dropped = await (async (): Promise<WeakRef<object>> => new WeakRef((await host.session(null, null)).shell))();
    const detached = await (async (): Promise<WeakRef<object>> => {
      const session = await host.session(null, null);
      session.detach(fakeConnection());
      return new WeakRef(session.shell);
    })();

    expect(await collected(detached)).toBe(true);
    expect(await collected(dropped)).toBe(false);
    host.stop();
  });

  it('a shell that was reset: the one it replaced is let go, and the session goes on', async () => {
    const host = standHost(hostConfig({ ...ctx, kept: false }));
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
    const standing = session.shell;
    expect(host.reset('usr_1')).toBe(true);
    await settle();
    expect(session.shell).not.toBe(standing);
  });

  it('a kept shell whose principal signed out', async () => {
    const seen: { fn?: FunctionSession } = {};
    const signing = { ...app, functions: (fn: FunctionSession) => ((seen.fn = fn), {}) } as unknown as NiscApp;
    const host = standHost(hostConfig({ ...ctx, app: signing }));
    const ended = await (async (): Promise<WeakRef<object>> => {
      const session = await host.session('t', 'usr_1');
      await settle();
      await seen.fn?.revoke();
      await settle();
      delete seen.fn;
      return new WeakRef(session.shell);
    })();

    expect(host.list()).toEqual([]);
    expect(await collected(ended)).toBe(true);
  });
});

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
    const host = standHost(hostConfig(seeded(() => ({ main: [{ action: 'counter', with: ['no-such-fragment'] }, 'counter'] }))));
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
    const host = standHost(hostConfig(seeded(async () => Promise.reject(new Error('the rows could not be read')))));
    const lines = await logged(async () => {
      const snapshot = await host.snapshot('t', 'usr_1');
      expect(snapshot.settled).toBe(true);
      expect(snapshot.trees['main']).toEqual([]);
    });
    expect(lines.some((line) => line.includes('seeds'))).toBe(true);
  });

  it('a delivery the shell throws on answers false, and says so', async () => {
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    unverifiedShell(session).publish = () => {
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
    const host = standHost(hostConfig(ctx));
    const broken = await host.session('t', 'usr_1');
    await host.session('t', 'usr_2');
    unverifiedShell(broken).getState = () => {
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

describe('shells — an event from a canvas the shell does not have', () => {
  it('is dropped, where one from a canvas it has still lands', async () => {
    const host = standHost(hostConfig({ ...ctx, app: twoCanvas }));
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
    const host = standHost(hostConfig(trayCtx));
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

  it('what is not one of nova’s events is not dispatched', async () => {
    const { session, a, b, n } = await setup();
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', origin: a, more: 'than an event has' });
    session.dispatch('tray', { type: 'ui:click', ref: 'bump', more: 'than an event has' });
    session.dispatch('tray', { type: 'ui:hover', ref: 'bump' });
    session.dispatch('tray', { ref: 'bump' });
    await tick();
    expect([n(a), n(b)]).toEqual([0, 0]);
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

describe('shells — a message delivered to a principal', () => {
  const inbox = { id: 'inbox', data: { heard: 0, said: '' }, triggers: [{ message: 'news', do: [{ increment: 'heard' }, { set: 'said', value: '@event.payload.text' }] }] };
  const listening = { ...app, actions: { inbox }, shell: { canvases: [{ id: 'main', initial: 'inbox' }] } } as unknown as NiscApp;
  const setup: HostSetup = { ...ctx, app: listening, resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['inbox'] }, variants: new Map() }) };
  type Session = Awaited<ReturnType<ReturnType<typeof standHost>['session']>>;
  const heard = (session: Session): { heard: unknown; said: unknown } => {
    const data = session.shell.getRuntime(session.shell.getState().canvases['main']?.active?.id ?? '')?.getData();
    return { heard: data?.['heard'], said: data?.['said'] };
  };

  it('reaches the shell a host keeps for them, with its payload, and nobody else’s', async () => {
    const host = standHost(hostConfig(setup));
    const mine = await host.session('t', 'usr_1');
    const theirs = await host.session('t', 'usr_2');

    expect(host.deliver('usr_1', 'news', { text: 'the deck moved' })).toBe(true);
    expect(heard(mine)).toEqual({ heard: 1, said: 'the deck moved' });
    expect(heard(theirs)).toEqual({ heard: 0, said: '' });
    expect(host.deliver('usr_nobody', 'news')).toBe(false);
    expect(host.list().map((shell) => shell.principal)).toEqual(['usr_1', 'usr_2']);
  });

  it('on a host that keeps none, reaches the shell built for each of their connections, and nobody else’s', async () => {
    const host = standHost(hostConfig({ ...setup, kept: false }));
    const mine = [await host.session('t', 'usr_1'), await host.session('t', 'usr_1')];
    const theirs = await host.session('t', 'usr_2');
    const nobodys = await host.session(null, null);

    expect(host.deliver('usr_1', 'news', { text: 'the deck moved' })).toBe(true);
    expect(mine.map(heard)).toEqual([
      { heard: 1, said: 'the deck moved' },
      { heard: 1, said: 'the deck moved' },
    ]);
    expect([heard(theirs), heard(nobodys)]).toEqual([
      { heard: 0, said: '' },
      { heard: 0, said: '' },
    ]);
    expect(host.deliver('usr_nobody', 'news')).toBe(false);
  });

  it('a shell that has ended hears nothing, and is not counted as one that took it', async () => {
    const host = standHost(hostConfig({ ...setup, kept: false }));
    const session = await host.session('t', 'usr_1');
    const connection = fakeConnection();
    session.attach(connection);
    session.detach(connection);
    expect(host.deliver('usr_1', 'news')).toBe(false);
  });
});

describe('shells — what a session hands out of its shell', () => {
  it('a member that changes what the shell is made of throws there, and works on the whole shell', async () => {
    const host = standHost(hostConfig(ctx));
    const session = await host.session('t', 'usr_1');
    const late = { id: 'late', initial: { action: 'counter' } };

    expect(() => session.shell.addCanvas(late)).toThrow(/^moss: addCanvas was called on a session's shell\. .* `unverifiedShell\(session\)`, from `@niscorp\/moss\/unverified`\.$/);
    expect(() => session.shell.registerAction({ id: 'made' })).toThrow(/^moss: registerAction was called on a session's shell\./);
    expect(Object.keys(session.shell.getState().canvases)).not.toContain('late');

    unverifiedShell(session).addCanvas(late);
    expect(Object.keys(session.shell.getState().canvases)).toContain('late');
  });
});
