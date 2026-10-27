import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { createRunningManifest } from '../src/artifactory';
import type { FunctionSession, NiscApp, SessionArtifacts } from '../src/manifest';
import type { Fabric } from '../src/runtime';
import type { FabricMessage } from '../src/runtime/runtime';
import { buildShellHosts } from '../src/server/hosts';
import type { Hosts } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';
import { createShellHost } from '../src/shells';
import { rowsDouble } from './saved-double';
import type { RowsDouble } from './saved-double';
import { turn } from './turn';

const words: ActionDefinition = { id: 'words', data: { title: 'Hello' }, layout: { component: 'Text', children: '$.title' } };
const heading: LayoutNode = { component: 'Heading', children: '$.title' };
const shell = { canvases: [{ id: 'main', initial: 'words' }], components: { Heading: {} } };

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

type Process = { hosts: Hosts; published: SessionArtifacts; sessionOf: (principal: string) => FunctionSession; screenOf: (principal: string) => Promise<Screen> };
type Screen = { drawn: () => string; type: (title: string) => void; instance: () => string | undefined };

const processOn = (rows: RowsDouble, fabric?: Fabric, userIdOf: (principal: string | null) => string = (principal) => principal ?? 'anonymous'): Process => {
  const sessions = new Map<string | null, FunctionSession>();
  const app: NiscApp = {
    charter: { public: ['words'] },
    actions: { words },
    shell,
    functions: (session) => {
      sessions.set(session.principal, session);
      return {};
    },
  };
  const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [shell], published: () => rows.as('*').inForce() });
  const identity = {
    resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, memoKey: 'public' }),
    composeScope: (principal: string | null) => ({ userId: userIdOf(principal) }),
  };
  const hosts = buildShellHosts({
    app,
    runtime: {},
    identity,
    running,
    // Whose rows a caller is handed follows from the scope the server composed for them, and from nothing else.
    savedAs: (scope) => rows.as(String(scope['userId'])),
    data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')), fingerprintsFor: async () => [] },
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    wrapWire: (inner) => inner,
    revokeSessions: undefined,
  });
  const signals = buildSignals({ fabric, identity: { invalidate: () => false, invalidateTag: () => [] }, reset: hosts.reset, deliver: hosts.deliver, adopt: hosts.adoptFor, adoptAll: hosts.adopt });
  running.onChange(hosts.adopt);
  running.onChangeFor(signals.adopt);
  return {
    hosts,
    published: running.publishedArtifacts(rows.as('*'), async () => ({ roles: ['public'], replayable: async () => [] })),
    sessionOf: (principal) => {
      const session = sessions.get(principal);
      if (session === undefined) throw new Error(`no session was built for ${principal}`);
      return session;
    },
    screenOf: async (principal) => {
      const session = await hosts.shells?.session('t', principal);
      const sent: string[] = [];
      session?.attach({ send: (text) => void sent.push(text), close: () => undefined });
      const instance = (): string | undefined => session?.shell.getCanvasState('main').stack.at(-1)?.id;
      return {
        instance,
        drawn: () => sent.filter((text) => text.startsWith('{"type":"render"')).at(-1) ?? '',
        type: (title) => {
          const runtime = session?.shell.getRuntime(instance() ?? '');
          runtime?.setData({ ...runtime.getData(), title });
        },
      };
    },
  };
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await turn();
};

const stopping = async (processes: readonly Process[], run: () => Promise<void>): Promise<void> => {
  try {
    await run();
  } finally {
    for (const process of processes) process.hosts.stop();
  }
};

describe('a layout saved from a function’s session', () => {
  it('shows on its principal’s open screen at once, with what they had typed, and on nobody else’s; the rows are theirs', async () => {
    const rows = rowsDouble();
    const here = processOn(rows);
    await stopping([here], async () => {
      const ada = await here.screenOf('ada');
      const ben = await here.screenOf('ben');
      await settle();
      ada.type('Typed since');
      await settle();
      const open = ada.instance();

      await here.sessionOf('ada').artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: heading, use: true } }]);
      await settle();

      expect(ada.drawn()).toContain('"name":"Heading"');
      expect(ada.drawn()).toContain('Typed since');
      expect(ada.instance()).toBe(open);
      expect(ben.drawn()).toContain('"name":"Text"');
      expect(ben.drawn()).not.toContain('Heading');
      expect(rows.rows.map((row) => row.principal)).toEqual(['ada']);
      expect(await here.sessionOf('ben').artifacts.list()).toEqual([]);

      // A shell for nobody asks no rows: everybody who is not signed in shares one `userId`.
      await here.hosts.shells?.snapshot(null, null);
      expect(rows.asked).not.toContain('anonymous');
    });
  });

  it('taken back with a reset, the build’s shows on that screen again', async () => {
    const here = processOn(rowsDouble());
    await stopping([here], async () => {
      const ada = await here.screenOf('ada');
      await settle();
      const saved = await here.sessionOf('ada').artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: heading, use: true } }]);
      await settle();
      expect(ada.drawn()).toContain('"name":"Heading"');

      await here.sessionOf('ada').artifacts.reset('layout', saved.artifacts[0]?.id ?? '');
      await settle();

      expect(ada.drawn()).toContain('"name":"Text"');
    });
  });

  it('a generated action reaches its owner’s open shell and nobody else’s: it is opened there, and is gone from it again after a reset', async () => {
    const here = processOn(rowsDouble());
    await stopping([here], async () => {
      const ada = await here.screenOf('ada');
      await here.screenOf('ben');
      await settle();

      const saved = await here.sessionOf('ada').artifacts.save([{ kind: 'action', body: { layout: { component: 'Text', children: 'what ada generated' } } }]);
      const id = saved.artifacts[0]?.id ?? '';
      await settle();

      expect(() => here.sessionOf('ben').shell.push('main', id)).toThrow();
      here.sessionOf('ada').shell.push('main', id);
      await settle();
      expect(ada.drawn()).toContain('what ada generated');

      here.sessionOf('ada').shell.pop('main');
      await here.sessionOf('ada').artifacts.reset('action', id);
      await settle();
      expect(() => here.sessionOf('ada').shell.push('main', id)).toThrow();
    });
  });

  it('a generated fragment reaches its owner’s open shell, and a reset takes it out of that shell again', async () => {
    const here = processOn(rowsDouble());
    await stopping([here], async () => {
      const ada = await here.screenOf('ada');
      await settle();
      const shell = here.sessionOf('ada').shell;

      const saved = await here.sessionOf('ada').artifacts.save([{ kind: 'fragment', body: { layout: { component: 'Heading', children: [{ slot: 'body' }] } } }]);
      const id = saved.artifacts[0]?.id ?? '';
      await settle();

      shell.push('main', 'words', undefined, [id]);
      await settle();
      expect(ada.drawn()).toContain('"name":"Heading"');

      shell.pop('main');
      await here.sessionOf('ada').artifacts.reset('fragment', id);
      await settle();
      expect(() => shell.push('main', 'words', undefined, [id])).toThrow(`Unknown fragment: ${id}`);
    });
  });

  it('published for everybody, it shows on every open screen at once, with what each had typed; one’s own in use stays over it', async () => {
    const rows = rowsDouble();
    const here = processOn(rows);
    await stopping([here], async () => {
      const ada = await here.screenOf('ada');
      const ben = await here.screenOf('ben');
      await settle();
      ben.type('Typed since');
      await settle();
      const open = ben.instance();
      await here.sessionOf('ada').artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: { component: 'Text', children: 'as ada has it' }, use: true } }]);

      await here.published.save([{ kind: 'layout', body: { ref: 'action/words', layout: heading, use: true } }]);
      await settle();

      expect(ben.drawn()).toContain('"name":"Heading"');
      expect(ben.drawn()).toContain('Typed since');
      expect(ben.instance()).toBe(open);
      expect(ada.drawn()).toContain('as ada has it');
      expect(ada.drawn()).not.toContain('Heading');
      expect(rows.rows.map((row) => row.principal).sort()).toEqual(['*', 'ada']);
    });
  });

  it('in a deployment of several processes: the others bring that principal’s shells level, told to and told nothing else', async () => {
    const bus = createBus();
    const rows = rowsDouble();
    const [a, b] = [processOn(rows, bus.endpoint()), processOn(rows, bus.endpoint())];
    await stopping([a, b], async () => {
      await a.screenOf('ada');
      const adaOnB = await b.screenOf('ada');
      const benOnB = await b.screenOf('ben');
      await settle();

      await a.sessionOf('ada').artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: heading, use: true } }]);
      await settle();

      expect(adaOnB.drawn()).toContain('"name":"Heading"');
      expect(benOnB.drawn()).toContain('"name":"Text"');
      expect(bus.carried).toEqual([{ kind: 'adopt', principal: 'ada', origin: expect.any(String) }]);
    });
  });

  it('an intent a function asks is not answered for a caller whose `userId` has become the one what is published is kept under', async () => {
    const now = { everybody: false };
    const here = processOn(rowsDouble(), undefined, (principal) => (now.everybody ? '*' : (principal ?? 'anonymous')));
    await stopping([here], async () => {
      await here.screenOf('ada');
      now.everybody = true;
      const writers = { generateDsl: async () => ({}), mapToShape: async () => ({}) } as unknown as Parameters<FunctionSession['answerIntent']>[0];

      await expect(here.sessionOf('ada').answerIntent(writers, { intent: 'anything', shape: {} })).rejects.toThrow('moss: a caller’s `userId` is "*"');
    });
  });

  it('a session a shell host was given nothing to save with says so', async () => {
    const sessions: FunctionSession[] = [];
    const made = createShellHost({
      composition: async () => ({ roles: [], scope: {}, actions: { words }, canvases: shell.canvases, components: {}, grantedFunctions: () => new Set<string>() }),
      hooks: { functions: (session) => (sessions.push(session), {}) },
      wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    });
    try {
      await made.host.session('t', 'ada');
      expect(() => sessions[0]?.artifacts).toThrow('moss: this shell host was given nothing to save with.');
    } finally {
      made.stop();
    }
  });
});
