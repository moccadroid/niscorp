// THE CLUSTER FABRIC — invalidations and nudges between processes. These pin
// the mechanism the case turns on: a signal published on A is applied on B and
// NOT re-applied on A (echo suppression), a remote apply never re-publishes (no
// amplification), both sides are fire-and-forget-contained, and with no fabric
// configured everything behaves exactly as one process does today.
//
// The integration uses two real shell hosts over one in-memory bus — the same
// `wireFabric` and the same appliers the server wires, so this exercises the
// real plumbing, not a mock of it.
import { describe, it, expect, vi } from 'vitest';
import { wireFabric } from '../src/server/fabric';
import type { FabricApply } from '../src/server/fabric';
import type { Fabric, FabricMessage } from '../src/runtime';
import { createShellHost } from '../src/shells';
import type { ShellHost } from '../src/shells';
import { hostConfig } from './shell-host-double';
import type { HostSetup } from './shell-host-double';
import { createIdentityCache } from '../src/identity/cache';
import type { NiscApp } from '../src/manifest';
import { turn } from './turn';

// A turn of the event loop (./turn.ts says why that is not a wait on a clock).
const tick = turn;
// A wait on the thing itself: it is asked again until it holds. `ms` is how
// long a failure takes to say so.
const until = async (pred: () => boolean | Promise<boolean>, ms = 3000): Promise<void> => {
  const start = Date.now();
  for (;;) {
    if (await pred()) return;
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
};

// ── wireFabric — the seam in isolation ───────────────────────────────────────
describe('wireFabric', () => {
  const spy = () => {
    const calls: string[][] = [];
    const apply: FabricApply = {
      invalidateIdentity: (p) => calls.push(['identity', p]),
      invalidateTenant: (t) => calls.push(['tenant', t]),
      nudge: (p, c) => calls.push(['nudge', p, c]),
    };
    return { calls, apply };
  };
  // `feed` is a message another moss process published; `hand` is whatever a
  // transport read off its wire, which nothing has typed.
  const collector = () => {
    const published: FabricMessage[] = [];
    let deliver: ((m: unknown) => void) | undefined;
    const fabric: Fabric = { publish: (m) => published.push(m), subscribe: (fn) => { deliver = fn; } };
    return { published, fabric, feed: (m: FabricMessage) => deliver?.(m), hand: (m: unknown) => deliver?.(m) };
  };

  it('publish stamps this process’s origin and hands it to the transport', () => {
    const { published, fabric } = collector();
    const publish = wireFabric(fabric, 'me', spy().apply);
    publish({ kind: 'invalidate-identity', principal: 'p1' });
    expect(published).toEqual([{ kind: 'invalidate-identity', principal: 'p1', origin: 'me' }]);
  });

  it('a remote message routes to the matching applier', () => {
    const { fabric, feed } = collector();
    const { calls, apply } = spy();
    wireFabric(fabric, 'me', apply);
    feed({ kind: 'nudge', principal: 'p1', channel: 'roster', origin: 'other' });
    feed({ kind: 'invalidate-tenant', tag: 't9', origin: 'other' });
    expect(calls).toEqual([['nudge', 'p1', 'roster'], ['tenant', 't9']]);
  });

  it('an echo — same origin — is dropped, so a signal is never applied twice on its sender', () => {
    const { fabric, feed } = collector();
    const { calls, apply } = spy();
    wireFabric(fabric, 'me', apply);
    feed({ kind: 'invalidate-identity', principal: 'p1', origin: 'me' });
    expect(calls).toEqual([]);
  });

  it('a throwing applier is contained', () => {
    const { fabric, feed } = collector();
    wireFabric(fabric, 'me', { invalidateIdentity: () => { throw new Error('boom'); }, invalidateTenant: () => {}, nudge: () => {} });
    expect(() => feed({ kind: 'invalidate-identity', principal: 'p1', origin: 'other' })).not.toThrow();
  });

  it('a throwing transport publish is contained — the local mutation already happened', () => {
    const fabric: Fabric = { publish: () => { throw new Error('transport down'); }, subscribe: () => {} };
    const publish = wireFabric(fabric, 'me', spy().apply);
    expect(() => publish({ kind: 'invalidate-tenant', tag: 't' })).not.toThrow();
  });

  it('no fabric: publish is a no-op and nothing subscribes', () => {
    const publish = wireFabric(undefined, 'me', spy().apply);
    expect(() => publish({ kind: 'nudge', principal: 'p', channel: 'c' })).not.toThrow();
  });

  // What a transport hands over came from another process, off a wire moss
  // does not own. It was switched on and its fields used as the type said they
  // were: a principal that was a number reached the identity cache as one.
  describe('what a transport hands over is read by a schema', () => {
    const notMessages: readonly [string, unknown][] = [
      ['a field of the wrong type', { kind: 'nudge', principal: 7, channel: 'roster', origin: 'other' }],
      ['a field that is missing', { kind: 'invalidate-tenant', origin: 'other' }],
      ['no origin', { kind: 'invalidate-identity', principal: 'p1' }],
      ['a kind this process does not know', { kind: 'reboot', origin: 'other' }],
      ['a field no message has', { kind: 'invalidate-identity', principal: 'p1', origin: 'other', also: 'this' }],
      ['text', '{"kind":"nudge","principal":"p1","channel":"roster","origin":"other"}'],
      ['nothing', null],
    ];

    it.each(notMessages)('%s: nothing is applied', (_what, handed) => {
      const said = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { fabric, hand } = collector();
        const { calls, apply } = spy();
        wireFabric(fabric, 'me', apply);
        expect(() => hand(handed)).not.toThrow();
        expect(calls).toEqual([]);
        expect(said).toHaveBeenCalledTimes(1);
      } finally {
        said.mockRestore();
      }
    });

    it('it is said once, with what was wrong and none of what it carried; the ones after it are dropped without a line, and a message is still applied', () => {
      const said = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { fabric, hand, feed } = collector();
        const { calls, apply } = spy();
        wireFabric(fabric, 'me', apply);
        hand({ kind: 'nudge', principal: 7, channel: 'the-secret-channel', origin: 'other' });
        hand({ kind: 'reboot', origin: 'other' });
        hand(null);
        expect(said).toHaveBeenCalledTimes(1);
        const line = said.mock.calls.flat().map(String).join(' ');
        expect(line).toContain('[moss:fabric]');
        expect(line).toContain('principal');
        expect(line).not.toContain('the-secret-channel');
        feed({ kind: 'nudge', principal: 'p1', channel: 'roster', origin: 'other' });
        expect(calls).toEqual([['nudge', 'p1', 'roster']]);
      } finally {
        said.mockRestore();
      }
    });
  });
});

// ── Two processes over one fabric ────────────────────────────────────────────
const counter = { id: 'counter', data: { n: 0 }, triggers: [] };
const app = {
  charter: { public: ['counter'] },
  assignments: {},
  actions: { counter },
  shell: { canvases: [{ id: 'main', initial: 'counter' }] },
} as unknown as NiscApp;

const shellCtx = (): HostSetup => ({
  app,
  resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map() }),
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
});

// An in-memory bus that delivers each publish to EVERY endpoint's subscriber,
// the sender included — so echo suppression is genuinely exercised, exactly as
// `LISTEN/NOTIFY` self-delivers.
const createBus = () => {
  const subs: Array<(m: FabricMessage) => void> = [];
  return {
    endpoint: (): Fabric => ({
      publish: (m) => { for (const s of [...subs]) s(m); },
      subscribe: (fn) => { subs.push(fn); },
    }),
  };
};

// A process: a real shell host + identity cache, wired to the fabric the way
// createServer wires them — the methods apply locally, THEN publish.
const makeNode = (fabric: Fabric | undefined, origin: string, shells: ShellHost) => {
  const identities = createIdentityCache({ resolve: async () => ({ roles: ['public'], scope: {} }) });
  const applied = { identity: 0, tenant: 0, nudge: 0 };
  const apply: FabricApply = {
    invalidateIdentity: (p) => { applied.identity += 1; identities.invalidate(p); shells.reset(p); },
    invalidateTenant: (t) => { applied.tenant += 1; identities.invalidateTag(t); },
    nudge: (p, c) => { applied.nudge += 1; shells.deliver(p, c); },
  };
  const publish = wireFabric(fabric, origin, apply);
  return {
    shells,
    applied,
    invalidateIdentity: (p: string) => { apply.invalidateIdentity(p); publish({ kind: 'invalidate-identity', principal: p }); },
    nudge: (p: string, c: string) => { apply.nudge(p, c); publish({ kind: 'nudge', principal: p, channel: c }); },
  };
};

describe('two processes over one fabric', () => {
  it('invalidate-identity on A resets the resident shell on B — no sign-out — and A applies it once', async () => {
    const bus = createBus();
    const a = makeNode(bus.endpoint(), 'A', createShellHost(hostConfig(shellCtx())));
    const bShells = createShellHost(hostConfig(shellCtx()));
    const b = makeNode(bus.endpoint(), 'B', bShells);

    const before = (await bShells.session('t', 'usr_1')).shell; // resident in B
    a.invalidateIdentity('usr_1');
    await until(async () => (await bShells.session('t', 'usr_1')).shell !== before);

    expect((await bShells.session('t', 'usr_1')).shell).not.toBe(before); // B rebuilt the shell
    expect(b.applied.identity).toBe(1); // B applied the remote signal
    expect(a.applied.identity).toBe(1); // A applied once — its own echo was dropped, not re-applied
  });

  it('a nudge on A wakes the principal’s channel on B, once', () => {
    const bus = createBus();
    const a = makeNode(bus.endpoint(), 'A', createShellHost(hostConfig(shellCtx())));
    const delivered: Array<{ principal: string; channel: string }> = [];
    const bShells = {
      session: async () => ({}) as never,
      adopt: () => {},
      list: () => [],
      reset: () => false,
      stop: () => {},
      deliver: (principal: string, channel: string) => { delivered.push({ principal, channel }); return true; },
    } as unknown as ShellHost;
    const b = makeNode(bus.endpoint(), 'B', bShells);

    a.nudge('usr_9', 'roster');
    expect(delivered).toEqual([{ principal: 'usr_9', channel: 'roster' }]);
    expect(b.applied.nudge).toBe(1);
    expect(a.applied.nudge).toBe(1); // echo dropped on A
  });

  it('with no fabric, a signal on A never reaches B — byte-identical to one process', async () => {
    const a = makeNode(undefined, 'A', createShellHost(hostConfig(shellCtx())));
    const bShells = createShellHost(hostConfig(shellCtx()));
    const b = makeNode(undefined, 'B', bShells);

    const before = (await bShells.session('t', 'usr_1')).shell;
    a.invalidateIdentity('usr_1');
    await tick();
    await tick();

    expect((await bShells.session('t', 'usr_1')).shell).toBe(before); // B untouched
    expect(b.applied.identity).toBe(0);
    expect(a.applied.identity).toBe(1); // A still does its own local work
  });

  it('a throwing subscriber on B does not harm the transport or A', () => {
    const bus = createBus();
    const a = makeNode(bus.endpoint(), 'A', createShellHost(hostConfig(shellCtx())));
    wireFabric(bus.endpoint(), 'B', { invalidateIdentity: () => { throw new Error('B is angry'); }, invalidateTenant: () => {}, nudge: () => {} });
    expect(() => a.invalidateIdentity('usr_1')).not.toThrow();
    expect(a.applied.identity).toBe(1);
  });
});
