import { describe, it, expect, vi, afterEach } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import type { SeedEntry } from '@niscorp/vex';
import { createRunningManifest } from '../src/artifactory';
import type { FunctionSession, NiscApp, ShellManifest } from '../src/manifest';
import { buildShellHosts } from '../src/server/hosts';
import type { ShellHostsDeps } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';
import { turn } from './turn';
import { noRows } from './saved-double';

const frameNamed = (name: string, dock = false): LayoutNode => ({
  component: 'Frame',
  props: { name },
  children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }, ...(dock ? [{ ref: 'dock' }] : [])],
});
const dockSaying = (text: string): LayoutNode => ({ component: 'Text', children: text });
const sheetNamed = (title: string): ActionFragment => ({ kind: 'fragment', id: 'sheet', layout: { component: 'Sheet', props: { title }, children: [{ slot: 'body' }] } });

const words: ActionDefinition = {
  id: 'words',
  data: { title: 'Hello', rows: [] },
  layout: { component: 'Text', children: '$.title' },
  endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'words/all' }, target: 'rows' } },
  lifecycle: { mount: [{ call: 'load' }] },
};
const wordsAll: SeedEntry = { fingerprint: 'words/all', dsl: { from: ['words'], fields: ['words.id'] } };

const docs = { path: '/docs', canvases: [{ id: 'main', initial: 'words' }], layout: frameNamed('the page, as shipped') };
const app: NiscApp = {
  charter: { public: ['words'] },
  actions: { words },
  entries: [wordsAll],
  shell: {
    canvases: [{ id: 'main', initial: { action: 'words', with: ['sheet'] } }],
    layout: frameNamed('as shipped', true),
    layoutStore: { dock: dockSaying('the dock, as shipped') },
    fragments: { sheet: sheetNamed('as shipped') },
  },
  pages: { docs },
};

const shipped = createRunningManifest({ shipped: app, grants: scopeGrants(['words']), shells: [] });

const depsWith = (running: ShellHostsDeps['running']): ShellHostsDeps => ({
  app,
  runtime: {},
  identity: {
    resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, memoKey: 'public' }),
    composeScope: () => ({}),
  },
  running,
  savedAs: () => noRows,
  data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')) },
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({ result: [] }), text: async () => '{"result":[]}' }),
  wrapWire: (inner) => inner,
  revokeSessions: undefined,
});

describe('the shell hosts — what a shell is made of is asked of the running manifest', () => {
  it('shows what the app shipped, when that is what the running manifest answers', async () => {
    const hosts = buildShellHosts(depsWith(shipped));
    try {
      const snapshot = await hosts.shells?.snapshot(null, null);
      expect(JSON.stringify(snapshot?.frame)).toContain('"name":"as shipped"');
      expect(JSON.stringify(snapshot?.frame)).toContain('the dock, as shipped');
      expect(JSON.stringify(snapshot?.trees['main'])).toContain('"title":"as shipped"');
      expect(snapshot?.live).toBe(false);
      expect(snapshot?.drawnWith).toEqual(['words/all']);
    } finally {
      hosts.stop();
    }
  });

  it('shows another frame, other fragments and other entries when the running manifest answers those, with nothing else changed', async () => {
    const asked: ShellManifest[] = [];
    const hosts = buildShellHosts(
      depsWith({
        ...shipped,
        artifactsFor: async (shell, who) => {
          asked.push(shell);
          const made = await shipped.artifactsFor(shell, who);
          return {
            ...made,
            frame: frameNamed('as published', true),
            layoutStore: { ...made.layoutStore, dock: dockSaying('the dock, as published') },
            fragments: { sheet: sheetNamed('as published') },
            entries: new Map([[wordsAll.fingerprint, { ...wordsAll, refresh: 'reactive' as const }]]),
          };
        },
      }),
    );
    try {
      const snapshot = await hosts.shells?.snapshot(null, null);

      expect(JSON.stringify(snapshot?.frame)).toContain('"name":"as published"');
      expect(JSON.stringify(snapshot?.frame)).toContain('the dock, as published');
      expect(JSON.stringify(snapshot?.frame)).not.toContain('as shipped');
      expect(JSON.stringify(snapshot?.trees['main'])).toContain('"title":"as published"');
      expect(JSON.stringify(snapshot?.trees['main'])).not.toContain('as shipped');
      expect(snapshot?.live).toBe(true);
      expect(snapshot?.why).toEqual(['words: its read "load" keeps answering (words/all is reactive)']);
      expect(asked).toEqual([app.shell]);
    } finally {
      hosts.stop();
    }
  });

  it('a page that only shows something is a file, and one with a field somebody can type in is not: what can be pressed is read off the layout the ref names', async () => {
    const field: ActionDefinition = { id: 'field', data: { title: '' }, layout: { component: 'Input', model: '$.title' } };
    const typing: NiscApp = {
      ...app,
      charter: { public: ['words', 'field'] },
      actions: { words, field },
      pages: { docs, form: { path: '/form', canvases: [{ id: 'main', initial: 'field' }] } },
    };
    const running = createRunningManifest({ shipped: typing, grants: scopeGrants(['words']), shells: [] });
    const hosts = buildShellHosts({ ...depsWith(running), app: typing });
    try {
      const shown = await hosts.pageAt('/docs')?.host.snapshot(null, null);
      expect(shown?.live).toBe(false);
      const typed = await hosts.pageAt('/form')?.host.snapshot(null, null);
      expect(typed?.live).toBe(true);
      expect(typed?.why).toEqual(['field: a person can act on it']);
    } finally {
      hosts.stop();
    }
  });

  it('a field in a stored layout the app names by ref counts too', async () => {
    const framed: ActionDefinition = { id: 'framed', data: { title: '' }, layout: { component: 'Stack', children: [{ ref: 'form' }] } };
    const typing: NiscApp = {
      ...app,
      charter: { public: ['words', 'framed'] },
      actions: { words, framed },
      pages: { form: { path: '/form', canvases: [{ id: 'main', initial: 'framed' }], layoutStore: { form: { component: 'Input', model: '$.title' } } } },
    };
    const running = createRunningManifest({ shipped: typing, grants: scopeGrants(['words']), shells: [] });
    const hosts = buildShellHosts({ ...depsWith(running), app: typing });
    try {
      const typed = await hosts.pageAt('/form')?.host.snapshot(null, null);
      expect(typed?.live).toBe(true);
      expect(typed?.why).toEqual(['framed: a person can act on it']);
    } finally {
      hosts.stop();
    }
  });

  it('a page’s host is asked for by the page’s own shell manifest', async () => {
    const asked: ShellManifest[] = [];
    const hosts = buildShellHosts(
      depsWith({
        ...shipped,
        artifactsFor: async (shell, who) => {
          asked.push(shell);
          return { ...(await shipped.artifactsFor(shell, who)), frame: frameNamed('the page, as published') };
        },
      }),
    );
    try {
      const snapshot = await hosts.pageAt('/docs')?.host.snapshot(null, null);
      expect(JSON.stringify(snapshot?.frame)).toContain('the page, as published');
      expect(asked).toEqual([docs]);
    } finally {
      hosts.stop();
    }
  });
});

describe('the shell hosts — a change reaches the living shells of every host', () => {
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await turn();
  };
  const notes: ActionDefinition = { id: 'ext.notes', data: {}, layout: { component: 'Text', children: 'notes' } };
  const granting: NiscApp = { ...app, charter: { public: ['words', 'ext.*'] } };
  const top = (session: { shell: { getCanvasState: (canvas: string) => { stack: { definitionId: string }[] } } } | undefined): string | undefined =>
    session?.shell.getCanvasState('main').stack.at(-1)?.definitionId;

  it('when what the app consists of changes, the shells of the app’s host and of each page’s adopt', async () => {
    const running = createRunningManifest({ shipped: granting, grants: scopeGrants(['words']), shells: [] });
    const hosts = buildShellHosts({ ...depsWith(running), app: granting });
    try {
      const mine = await hosts.shells?.session('t', 'usr_1');
      const onPage = await hosts.pageAt('/docs')?.host.session(null, null);
      expect(() => mine?.shell.push('main', 'ext.notes')).toThrow();
      expect(() => onPage?.shell.push('main', 'ext.notes')).toThrow();

      running.replace('bundles', { 'ext.notes': notes });
      hosts.adopt();
      await settle();

      mine?.shell.push('main', 'ext.notes');
      onPage?.shell.push('main', 'ext.notes');
      expect([top(mine), top(onPage)]).toEqual(['ext.notes', 'ext.notes']);
    } finally {
      hosts.stop();
    }
  });

  it('a living shell whose frame, layout store and fragments the running manifest answers differently after a change shows the change', async () => {
    const answering = { published: false };
    const hosts = buildShellHosts(
      depsWith({
        ...shipped,
        artifactsFor: async (shell, who) => {
          const made = await shipped.artifactsFor(shell, who);
          if (!answering.published) return made;
          return { ...made, frame: frameNamed('as published', true), layoutStore: { ...made.layoutStore, dock: dockSaying('the dock, as published') }, fragments: { sheet: sheetNamed('as published') } };
        },
      }),
    );
    try {
      const session = await hosts.shells?.session('t', 'usr_1');
      const sent: string[] = [];
      session?.attach({ send: (text) => void sent.push(text), close: () => undefined });
      await settle();
      const frames = (): string[] => sent.filter((text) => text.startsWith('{"type":"frame"'));
      expect(frames().at(-1)).toContain('"name":"as shipped"');
      expect(frames().at(-1)).toContain('the dock, as shipped');
      const before = frames().length;

      answering.published = true;
      hosts.adopt();
      await settle();

      expect(frames().length).toBeGreaterThan(before);
      expect(frames().at(-1)).toContain('"name":"as published"');
      expect(frames().at(-1)).toContain('the dock, as published');
      expect(frames().at(-1)).not.toContain('as shipped');
      // A fragment is laid around an action when it is pushed: what is on screen keeps the old one.
      session?.shell.push('main', 'words', undefined, ['sheet']);
      await settle();
      expect(sent.filter((text) => text.startsWith('{"type":"render"')).at(-1)).toContain('"title":"as published"');
    } finally {
      hosts.stop();
    }
  });

  it('a layout that changes reaches a screen that is already open, and the screen keeps its data', async () => {
    const running = createRunningManifest({ shipped: granting, grants: scopeGrants(['words']), shells: [] });
    const hosts = buildShellHosts({ ...depsWith(running), app: granting });
    try {
      const mine = await hosts.shells?.session('t', 'usr_1');
      const sent: string[] = [];
      mine?.attach({ send: (text) => void sent.push(text), close: () => undefined });
      await settle();
      const open = mine?.shell.getCanvasState('main').stack.at(-1)?.id ?? '';
      const instance = mine?.shell.getRuntime(open);
      instance?.setData({ ...instance.getData(), title: 'Typed since' });
      await settle();
      const drawn = (): string => sent.filter((text) => text.startsWith('{"type":"render"')).at(-1) ?? '';
      expect(drawn()).toContain('Typed since');
      expect(drawn()).not.toContain('Heading');

      running.replace('edits', { words: { ...words, layout: { component: 'Heading', children: '$.title' } } });
      hosts.adopt();
      await settle();

      expect(mine?.shell.getCanvasState('main').stack.at(-1)?.id).toBe(open);
      expect(drawn()).toContain('Heading');
      expect(drawn()).toContain('Typed since');
    } finally {
      hosts.stop();
    }
  });

  it('the layout of an action that left is taken out of the shell’s store with it', async () => {
    const running = createRunningManifest({ shipped: granting, grants: scopeGrants(['words']), shells: [] });
    const hosts = buildShellHosts({ ...depsWith(running), app: granting });
    try {
      const mine = await hosts.shells?.session('t', 'usr_1');
      running.replace('bundles', { 'ext.notes': notes });
      hosts.adopt();
      await settle();
      expect(mine?.shell.layoutStore.get('action/ext.notes')).toEqual(notes.layout);

      running.replace('bundles', {});
      hosts.adopt();
      await settle();
      expect(mine?.shell.layoutStore.get('action/ext.notes')).toBeUndefined();
      expect(mine?.shell.layoutStore.get('action/words')).toEqual(words.layout);
      expect(mine?.shell.layoutStore.get('dock')).toBeDefined();
    } finally {
      hosts.stop();
    }
  });

  it('a session’s shell hands out a definition with its layout in place, as it stands now, and its store is to read', async () => {
    const running = createRunningManifest({ shipped: granting, grants: scopeGrants(['words']), shells: [] });
    const hosts = buildShellHosts({ ...depsWith(running), app: granting });
    try {
      const mine = await hosts.shells?.session('t', 'usr_1');
      await settle();
      const open = mine?.shell.getCanvasState('main').stack.at(-1)?.id ?? '';
      const layoutOf = (): string => JSON.stringify(mine?.shell.getRuntime(open)?.definition.layout);
      expect(layoutOf()).toContain('"component":"Text"');
      expect(layoutOf()).not.toContain('action/words');
      expect(mine?.shell.getRuntime(open)?.definition.id).toBe('words');
      expect(mine?.shell.getRuntime(open)?.getData()).toMatchObject({ title: 'Hello' });
      expect(mine?.shell.getRuntime('nobody')).toBeUndefined();

      running.replace('edits', { words: { ...words, layout: { component: 'Heading', children: '$.title' } } });
      hosts.adopt();
      await settle();
      expect(layoutOf()).toContain('"component":"Heading"');

      expect(() => mine?.shell.layoutStore.set('action/words', { component: 'Text', children: 'mine' })).toThrow(/^moss: layoutStore\.set was called on a session's shell\./);
      expect(() => mine?.shell.layoutStore.delete('action/words')).toThrow(/^moss: layoutStore\.delete was called on a session's shell\./);
      expect(mine?.shell.layoutStore.get('action/words')).toEqual({ component: 'Heading', children: '$.title' });
    } finally {
      hosts.stop();
    }
  });

  it('a principal’s reset reaches their shell in the app’s host and the ones a page built for them, and nobody else’s', async () => {
    const hosts = buildShellHosts(depsWith(shipped));
    try {
      const signals = buildSignals({ fabric: undefined, identity: { invalidate: () => true, invalidateTag: () => [] }, reset: hosts.reset, adopt: hosts.adoptFor, deliver: hosts.deliver });
      const page = hosts.pageAt('/docs')?.host;
      const sessions = [await hosts.shells?.session('t', 'usr_1'), await page?.session('t', 'usr_1'), await page?.session('t', 'usr_2')];
      const before = sessions.map((session) => session?.shell);

      expect(signals.invalidateIdentity('usr_1')).toBe(true);
      await settle();

      expect(sessions.map((session, index) => session?.shell === before[index])).toEqual([false, false, true]);
      expect(hosts.reset('usr_nobody')).toBe(false);
    } finally {
      hosts.stop();
    }
  });
});

describe('the shell hosts — what each host is told', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the app’s host keeps one shell for a principal; a page’s keeps none, and builds one for each asking', async () => {
    const hosts = buildShellHosts(depsWith(shipped));
    try {
      const page = hosts.pageAt('/docs')?.host;
      expect((await hosts.shells?.session('t', 'usr_1'))?.shell).toBe((await hosts.shells?.session('t', 'usr_1'))?.shell);
      expect((await page?.session('t', 'usr_1'))?.shell).not.toBe((await page?.session('t', 'usr_1'))?.shell);
      expect(page?.list()).toEqual([]);
      expect(hosts.shells?.list().map((shell) => shell.principal)).toEqual(['usr_1']);
    } finally {
      hosts.stop();
    }
  });

  it('a host that is handed out has no way to adopt and none to stop: those are asked of all of them at once', () => {
    const hosts = buildShellHosts(depsWith(shipped));
    try {
      const handedOut = ['session', 'snapshot', 'deliver', 'list', 'reset'];
      expect(Object.keys(hosts.shells ?? {})).toEqual(handedOut);
      expect(Object.keys(hosts.pageAt('/docs')?.host ?? {})).toEqual(handedOut);
    } finally {
      hosts.stop();
    }
  });

  it('stopping stops every host’s sweep: the app’s, and each page’s', () => {
    const set = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const hosts = buildShellHosts(depsWith(shipped));
    const made = set.mock.results.map((result) => result.value);
    expect(made).toHaveLength(2);
    hosts.stop();
    expect(new Set(clear.mock.calls.map(([handle]) => handle))).toEqual(new Set(made));
  });

  it('`runtime.shellIdleMs` is how long a kept shell nobody is attached to stands', async () => {
    vi.useFakeTimers();
    const hosts = buildShellHosts({ ...depsWith(shipped), runtime: { shellIdleMs: 5_000 } });
    try {
      await hosts.shells?.session('t', 'usr_1');
      await vi.advanceTimersByTimeAsync(4_000);
      expect(hosts.shells?.list()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(6_000);
      expect(hosts.shells?.list()).toEqual([]);
    } finally {
      hosts.stop();
    }
  });

  it('`runtime.endpointTimeoutMs` is how long a screen’s call waits for its reply', async () => {
    vi.useFakeTimers();
    const signals: (AbortSignal | undefined)[] = [];
    const unanswered: ShellHostsDeps['wire'] = () => (_url, init) =>
      new Promise((_resolve, reject) => {
        signals.push(init?.signal);
        init?.signal?.addEventListener('abort', () => reject(new Error('given up on')));
      });
    const hosts = buildShellHosts({ ...depsWith(shipped), runtime: { endpointTimeoutMs: 2_000 }, wire: unanswered });
    try {
      await hosts.shells?.session('t', 'usr_1');
      await vi.advanceTimersByTimeAsync(1_900);
      expect(signals.map((signal) => signal?.aborted)).toEqual([false]);
      await vi.advanceTimersByTimeAsync(200);
      expect(signals.map((signal) => signal?.aborted)).toEqual([true]);
    } finally {
      hosts.stop();
    }
  });

  it('a sign-out forgets every session the principal holds, where the deployment keeps them', async () => {
    const forgotten: string[] = [];
    const sessions: FunctionSession[] = [];
    const hosts = buildShellHosts({
      ...depsWith(shipped),
      app: { ...app, functions: (session) => (sessions.push(session), {}) },
      revokeSessions: async (principal) => void forgotten.push(principal),
    });
    try {
      await hosts.shells?.session('t', 'usr_1');
      await sessions[0]?.revoke();
      expect(forgotten).toEqual(['usr_1']);
    } finally {
      hosts.stop();
    }
  });
});
