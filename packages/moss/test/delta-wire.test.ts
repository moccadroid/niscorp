import { describe, it, expect, afterAll } from 'vitest';
import { createServer as createHttp } from 'node:http';
import type { Server } from 'node:http';
import { createShellHost } from '../src/shells';
import { createSocket } from '../src/socket';
import { attachSocket } from '../src/node';
import { createWire } from '../src/client';
import type { WireEnv } from '../src/client';
import type { NiscApp } from '../src/app';

// ═══════════════════════════════════════════════════════════════
// Frame deltas over a REAL websocket — `ws` on one end, the wire on the
// other, an actual upgrade in between. shells.test and client.test drive each
// half through its own seam; this is the one place the two meet, and the seam
// it covers that neither can is the capability itself: `delta=1` on the
// upgrade url, parsed by the socket, honoured by the host.
//
// The invariant is not "smaller". It is that a delta-capable terminal and a
// plain one, attached to the SAME durable shell, render the identical
// application after every change.
// ═══════════════════════════════════════════════════════════════

// A tree big enough that one changed number is a small part of it — the shape
// deltas exist for. Anything smaller is correctly sent whole.
const ROWS = 40;
const app = {
  charter: { public: ['roster'] },
  assignments: {},
  actions: {
    roster: {
      id: 'roster',
      data: { n: 0 },
      triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
      layout: [
        ...Array.from({ length: ROWS }, (_, i) => ({ component: 'Text', children: `a steady row of chrome that never changes, number ${i}` })),
        { component: 'Text', children: '$.n' },
      ],
    },
  },
  shell: { canvases: [{ id: 'main', initial: 'roster' }] },
} as unknown as NiscApp;

const until = (pred: () => boolean, why: string, ms = 10_000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (pred()) return resolve();
      if (Date.now() - started > ms) return reject(new Error(`timed out: ${why}`));
      setTimeout(tick, 20);
    };
    tick();
  });

const servers: Server[] = [];

// A live server on an ephemeral port, wired the way ./node wires one.
const listening = async (delta: boolean): Promise<string> => {
  const shells = createShellHost({
    app,
    catalog: () => ({ ids: ['roster'], hash: 'h' }),
    variants: () => new Map(),
    roles: () => ['public'],
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    runtime: {} as never,
    policy: () => ({ default: 'deny', entities: {} }),
    delta,
  });
  const accept = createSocket({
    session: (token) => (token === 'tok' ? 'usr_1' : null),
    catalog: () => ({ ids: ['roster'], hash: 'h' }),
    shells,
    revalidateMs: 0,
  });
  const httpServer = createHttp((_req, res) => res.end('ok'));
  attachSocket(httpServer, accept);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  servers.push(httpServer);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `ws://127.0.0.1:${address.port}/socket`;
};

// Counts what actually crosses the socket — the only honest place to see it.
type Tally = { render: number; delta: number; bytes: number };
const countingEnv = (url: string, tally: Tally): WireEnv => ({
  tokens: { load: () => 'tok', save: () => {}, clear: () => {} },
  defaultUrl: () => url,
  socket: (target) => {
    const ws = new WebSocket(target);
    ws.addEventListener('message', (event) => {
      const text = String((event as MessageEvent).data);
      tally.bytes += text.length;
      const type = (JSON.parse(text) as { type: string }).type;
      if (type === 'render') tally.render += 1;
      if (type === 'render-delta') tally.delta += 1;
    });
    return ws;
  },
});

afterAll(() => {
  for (const server of servers) server.close();
});

describe('frame deltas over a real websocket', () => {
  it('a delta terminal and a plain one on one shell render the identical application', async () => {
    const url = await listening(true);
    const askedTally: Tally = { render: 0, delta: 0, bytes: 0 };
    const silentTally: Tally = { render: 0, delta: 0, bytes: 0 };
    const asked = createWire({ env: countingEnv(url, askedTally), delta: true });
    const silent = createWire({ env: countingEnv(url, silentTally) });
    try {
      const treeOf = (wire: typeof asked): string => JSON.stringify(wire.snapshot().trees.get('main') ?? null);
      const same = (): boolean => treeOf(asked) === treeOf(silent) && treeOf(asked) !== 'null';

      await until(same, 'both terminals render the boot screen');

      for (let i = 1; i <= 8; i += 1) {
        const was = treeOf(asked);
        asked.dispatch('main', { type: 'ui:click', ref: 'bump' });
        await until(() => treeOf(asked) !== was && same(), `both terminals reach n=${i}`);
      }

      // Both ends really exercised the path they were meant to. Measured here:
      // 1 whole frame + 8 deltas = 6.8 KB, against 9 whole frames = 53.1 KB.
      expect(askedTally.delta).toBeGreaterThan(0);
      expect(silentTally.delta).toBe(0);
      // Ten frames' worth of chrome not re-sent — the whole point.
      expect(askedTally.bytes).toBeLessThan(silentTally.bytes / 2);
      // And nobody had to recover: no delta failed, so no resync was needed.
      expect(askedTally.render).toBe(silentTally.render - askedTally.delta);
    } finally {
      asked.dispose();
      silent.dispose();
    }
  });

  it('with the flag off, a terminal that asks is served whole frames and still works', async () => {
    const url = await listening(false);
    const tally: Tally = { render: 0, delta: 0, bytes: 0 };
    const wire = createWire({ env: countingEnv(url, tally), delta: true });
    try {
      const treeOf = (): string => JSON.stringify(wire.snapshot().trees.get('main') ?? null);
      await until(() => treeOf() !== 'null', 'the boot screen arrives');
      const was = treeOf();
      wire.dispatch('main', { type: 'ui:click', ref: 'bump' });
      await until(() => treeOf() !== was, 'the change arrives');
      expect(tally.delta).toBe(0);
      expect(tally.render).toBeGreaterThan(1);
    } finally {
      wire.dispose();
    }
  });
});
