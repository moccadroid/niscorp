import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition } from '@niscorp/nova';
import { createIdentityCache } from '../src/identity/cache';
import { createRunningManifest } from '../src/manifest';
import type { NiscApp } from '../src/manifest';
import type { Fabric, FabricMessage } from '../src/runtime';
import { buildShellHosts } from '../src/server/hosts';
import type { Hosts } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';
import type { Signals } from '../src/server/signals';

// WHAT A SERVER SAYS TO ITS OWN SHELLS AND TO EVERY OTHER PROCESS
// (../src/server/signals.ts), with the server's own wiring: each process here
// is the shell hosts and the signals as `assembleServer` stands them up, over
// an identity cache, and the fabric is a list of subscribers. No server and no
// database.
//
// The fabric's own tests (fabric.test.ts) wire a process by hand, in the test.
// So four lines of the real wiring, the four that publish, came out of a copy
// one at a time and nothing failed.

// An action that listens: it counts what it hears on `news`, and keeps what
// the message carried.
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
const running = createRunningManifest({ shipped: app, grants: scopeGrants([]) });

// A fabric that hands each message to every subscriber, the sender's own
// included, as a database's LISTEN/NOTIFY does.
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

// One process of a deployment: its hosts, its identity records, its signals.
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
    identity: { resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, key: 'public' }), composeScope: () => ({}) },
    running,
    data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')) },
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    wrapWire: (inner) => inner,
    revokeSessions: undefined,
  });
  const signals = buildSignals({ fabric, identity: { invalidate: identity.invalidate, invalidateTag: identity.invalidateTag }, reset: hosts.reset, deliver: hosts.deliver });
  return { hosts, signals, resolved, identityOf: identity.get };
};

type Session = NonNullable<Awaited<ReturnType<NonNullable<Hosts['shells']>['session']>>>;
const heard = (session: Session | undefined): { heard: unknown; said: unknown } | undefined => {
  const data = session?.shell.getRuntime(session.shell.getState().canvases['main']?.active?.id ?? '')?.getData();
  return data === undefined ? undefined : { heard: data['heard'], said: data['said'] };
};

// Everything of one principal that lives in a process: the shell the app
// keeps for them, and one a page built for each of two connections.
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
  // A NUDGE TELLS SOMEBODY'S SCREENS THAT A CHANNEL CHANGED. Their screens are
  // every living shell of theirs: the one the app keeps, and the one a page
  // built for each connection they have to it. It reached the kept shell
  // alone, so a page somebody had open went on showing what it had read.
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
      // Its own message came back to it over the fabric, and was dropped.
      expect(onA.map((session) => heard(session)?.heard)).toEqual([1, 1, 1]);
      expect(bus.carried).toEqual([{ kind: 'nudge', principal: 'usr_1', channel: 'news', origin: expect.any(String) }]);
    });
  });
});

describe('the signals of a server — what a reaction delivers', () => {
  // The payload is for the shells in this process. Another process is told
  // the channel changed and nothing else: what crosses processes names no row
  // and carries no value, and its shells read again under their own policy.
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
      // Nobody of that name lives here: an answer, and it is still said to the
      // processes where they may.
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
      // A terminal on their shell, which says when it is served a second frame:
      // the first when it was attached, the second by the shell it is carried to.
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

      // This process never resolved them: it held nothing, and says so.
      expect(a.signals.invalidateIdentity('usr_1')).toBe(false);

      // The other process forgot the record it held: asked again, it resolves again.
      await b.identityOf('usr_1');
      expect(b.resolved).toEqual(['usr_1', 'usr_1']);
      // And rebuilt their shell: the terminal was carried to the replacement.
      await carried;
      expect(onB?.shell).not.toBe(before);
    });
  });

  it('`invalidateTenant` forgets every record of the tenant in every process, and rebuilds nobody’s shell', async () => {
    const bus = createBus();
    const [a, b] = [processOn(bus.endpoint()), processOn(bus.endpoint())];
    await stopping([a, b], async () => {
      for (const principal of ['acme_ada', 'acme_ben', 'other_cy']) await b.identityOf(principal);
      await a.identityOf('acme_ada');
      const onB = await b.hosts.shells?.session('t', 'acme_ada');
      const before = onB?.shell;

      // How many this process held.
      expect(a.signals.invalidateTenant('acme')).toBe(1);

      b.resolved.length = 0;
      for (const principal of ['acme_ada', 'acme_ben', 'other_cy']) await b.identityOf(principal);
      expect(b.resolved).toEqual(['acme_ada', 'acme_ben']);
      expect(onB?.shell).toBe(before);
      expect(bus.carried).toEqual([{ kind: 'invalidate-tenant', tag: 'acme', origin: expect.any(String) }]);
    });
  });
});
