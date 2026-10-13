import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition } from '@niscorp/nova';
import { createIdentityCache } from '../src/identity/cache';
import { createRunningManifest } from '../src/artifactory';
import type { NiscApp } from '../src/manifest';
import type { Fabric } from '../src/runtime';
import type { FabricMessage } from '../src/runtime/runtime';
import { buildShellHosts } from '../src/server/hosts';
import type { Hosts } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';
import type { Signals } from '../src/server/signals';
import { noRows } from './saved-double';

const inbox: ActionDefinition = {
  id: 'inbox',
  data: { heard: 0, said: 'nothing' },
  triggers: [{ message: 'news', do: [{ increment: 'heard' }, { set: 'said', value: '@event.payload.text' }] }],
};
const app: NiscApp = {
  charter: { public: ['inbox'] },
  actions: { inbox },
  shell: { canvases: [{ id: 'main', initial: 'inbox' }] },
  pages: { board: { path: '/board', canvases: [{ id: 'main', initial: 'inbox' }] } },
};
const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [] });

const createBus = (): { endpoint: () => Fabric; carried: FabricMessage[] } => {
  const subscribers: ((message: FabricMessage) => void)[] = [];
  const carried: FabricMessage[] = [];
  return {
    carried,
    endpoint: () => ({
      publish: (message) => {
        carried.push(message);
        for (const subscriber of [...subscribers]) subscriber(message);
      },
      subscribe: (subscriber) => void subscribers.push(subscriber),
    }),
  };
};

type Process = { hosts: Hosts; signals: Signals; resolved: string[]; identityOf: (principal: string) => Promise<unknown> };

const processOn = (fabric: Fabric | undefined): Process => {
  const resolved: string[] = [];
  const identity = createIdentityCache({
    resolve: async (principal) => {
      resolved.push(principal);
      return { roles: ['public'], scope: {}, tag: principal.startsWith('acme_') ? 'acme' : 'other' };
    },
    idleMs: 0,
  });
  const hosts = buildShellHosts({
    app,
    runtime: {},
    identity: { resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, memoKey: 'public' }), composeScope: () => ({}) },
    running,
    savedAs: () => noRows,
    data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')), fingerprintsFor: async () => [] },
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    wrapWire: (inner) => inner,
    revokeSessions: undefined,
  });
  const signals = buildSignals({ fabric, identity: { invalidate: identity.invalidate, invalidateTag: identity.invalidateTag }, reset: hosts.reset, adopt: hosts.adoptFor, deliver: hosts.deliver });
  return { hosts, signals, resolved, identityOf: identity.get };
};

type Session = NonNullable<Awaited<ReturnType<NonNullable<Hosts['shells']>['session']>>>;
const heard = (session: Session | undefined): { heard: unknown; said: unknown } | undefined => {
  const data = session?.shell.getRuntime(session.shell.getState().canvases['main']?.active?.id ?? '')?.getData();
  return data === undefined ? undefined : { heard: data['heard'], said: data['said'] };
};

const shellsOf = async (process: Process, principal: string): Promise<(Session | undefined)[]> => {
  const page = process.hosts.pageAt('/board')?.host;
  return [await process.hosts.shells?.session('t', principal), await page?.session('t', principal), await page?.session('t', principal)];
};
const stopping = async (processes: readonly Process[], run: () => Promise<void>): Promise<void> => {
  try {
    await run();
  } finally {
    for (const process of processes) process.hosts.stop();
  }
};

describe('the signals of a server — a nudge', () => {
  it('reaches every living shell of the principal: the one the app keeps and each one a page built for them', async () => {
    const here = processOn(undefined);
    await stopping([here], async () => {
      const mine = await shellsOf(here, 'usr_1');
      const theirs = await shellsOf(here, 'usr_2');
      const nobodys = await here.hosts.pageAt('/board')?.host.session(null, null);

      here.signals.nudge('usr_1', 'news');

      expect(mine.map((session) => heard(session)?.heard)).toEqual([1, 1, 1]);
      expect([...theirs, nobodys].map((session) => heard(session)?.heard)).toEqual([0, 0, 0, 0]);
    });
  });

  it('crosses the fabric: every other process tells the shells it holds for them, and the sender is told once', async () => {
    const bus = createBus();
    const [a, b] = [processOn(bus.endpoint()), processOn(bus.endpoint())];
    await stopping([a, b], async () => {
      const onA = await shellsOf(a, 'usr_1');
      const onB = await shellsOf(b, 'usr_1');

      a.signals.nudge('usr_1', 'news');

      expect(onB.map((session) => heard(session)?.heard)).toEqual([1, 1, 1]);
      expect(onA.map((session) => heard(session)?.heard)).toEqual([1, 1, 1]);
      expect(bus.carried).toEqual([{ kind: 'nudge', principal: 'usr_1', channel: 'news', origin: expect.any(String) }]);
    });
  });
});

describe('the signals of a server — what a reaction delivers', () => {
  it('lands here with what it carries, in every living shell of the principal, and elsewhere as a nudge that carries nothing', async () => {
    const bus = createBus();
    const [a, b] = [processOn(bus.endpoint()), processOn(bus.endpoint())];
    await stopping([a, b], async () => {
      const onA = await shellsOf(a, 'usr_1');
      const onB = await shellsOf(b, 'usr_1');

      expect(a.signals.deliver('usr_1', 'news', { text: 'the deck moved' })).toBe(true);

      expect(onA.map(heard)).toEqual(Array.from({ length: 3 }, () => ({ heard: 1, said: 'the deck moved' })));
      expect(onB.map((session) => heard(session)?.heard)).toEqual([1, 1, 1]);
      expect(JSON.stringify(bus.carried)).not.toContain('the deck moved');
      expect(bus.carried).toEqual([{ kind: 'nudge', principal: 'usr_1', channel: 'news', origin: expect.any(String) }]);
      expect(a.signals.deliver('usr_elsewhere', 'news')).toBe(false);
      expect(bus.carried).toHaveLength(2);
    });
  });
});

describe('the signals of a server — who somebody is changed', () => {
  it('`invalidateIdentity` forgets them and rebuilds their shells in every process, and answers whether this one held them', async () => {
    const bus = createBus();
    const [a, b] = [processOn(bus.endpoint()), processOn(bus.endpoint())];
    await stopping([a, b], async () => {
      await b.identityOf('usr_1');
      const onB = await b.hosts.shells?.session('t', 'usr_1');
      const before = onB?.shell;
      const frames = { served: 0, second: (): void => undefined };
      const carried = new Promise<void>((second) => void (frames.second = second));
      onB?.attach({
        send: (text) => {
          if (!text.includes('"type":"frame"')) return;
          frames.served += 1;
          if (frames.served === 2) frames.second();
        },
        close: () => undefined,
      });

      expect(a.signals.invalidateIdentity('usr_1')).toBe(false);

      await b.identityOf('usr_1');
      expect(b.resolved).toEqual(['usr_1', 'usr_1']);
      await carried;
      expect(onB?.shell).not.toBe(before);
    });
  });

  it('`invalidateTag` forgets every record that carries the tag in every process, and rebuilds nobody’s shell', async () => {
    const bus = createBus();
    const [a, b] = [processOn(bus.endpoint()), processOn(bus.endpoint())];
    await stopping([a, b], async () => {
      for (const principal of ['acme_ada', 'acme_ben', 'other_cy']) await b.identityOf(principal);
      await a.identityOf('acme_ada');
      const onB = await b.hosts.shells?.session('t', 'acme_ada');
      const before = onB?.shell;

      expect(a.signals.invalidateTag('acme')).toBe(1);

      b.resolved.length = 0;
      for (const principal of ['acme_ada', 'acme_ben', 'other_cy']) await b.identityOf(principal);
      expect(b.resolved).toEqual(['acme_ada', 'acme_ben']);
      expect(onB?.shell).toBe(before);
      expect(bus.carried).toEqual([{ kind: 'invalidate-tag', tag: 'acme', origin: expect.any(String) }]);
    });
  });
});
