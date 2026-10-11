import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import type { SeedEntry } from '@niscorp/vex';
import { createRunningManifest } from '../src/manifest';
import type { NiscApp, ShellManifest } from '../src/manifest';
import { buildShellHosts } from '../src/server/hosts';
import type { HostParts } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';

// THE SHELL HOSTS AS THE SERVER STANDS THEM UP (../src/server/hosts.ts), with
// no server and no database: the wiring is handed an app, a running manifest
// and stand-ins for the rest.
//
// WHAT A SHELL IS MADE OF IS ASKED OF THE RUNNING MANIFEST, AND OF NOTHING
// ELSE. The actions always were. The frame, the layout store and the fragments
// were read off the shell's manifest by this wiring, so a running manifest
// that answered others was not heard. Here it answers others, and the shell
// shows them.

// A frame around one canvas. `dock` puts a `{ ref }` beside it, which the
// layout store answers.
const frameNamed = (name: string, dock = false): LayoutNode => ({
  component: 'Frame',
  props: { name },
  children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }, ...(dock ? [{ ref: 'dock' }] : [])],
});
const dockSaying = (text: string): LayoutNode => ({ component: 'Text', children: text });
const sheetNamed = (title: string): ActionFragment => ({ kind: 'fragment', id: 'sheet', layout: { component: 'Sheet', props: { title }, children: [{ slot: 'body' }] } });

// One read, made when the action opens: whether its screen can still change
// depends on the entry behind the fingerprint.
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

const shipped = createRunningManifest({ shipped: app, grants: scopeGrants(['words']) });

// Everything a host is handed but the running manifest, the same for every
// case: who somebody is, the wire, and no code of the app's.
const partsWith = (running: HostParts['running']): HostParts => ({
  app,
  runtime: {},
  identity: {
    resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, key: 'public' }),
    composeScope: () => ({}),
  },
  running,
  data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')) },
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({ result: [] }), text: async () => '{"result":[]}' }),
  wrapWire: (inner) => inner,
  revokeSessions: undefined,
});

describe('the shell hosts — what a shell is made of is asked of the running manifest', () => {
  it('shows what the app shipped, when that is what the running manifest answers', async () => {
    const hosts = buildShellHosts(partsWith(shipped));
    try {
      const snapshot = await hosts.shells?.snapshot(null, null);
      expect(JSON.stringify(snapshot?.frame)).toContain('"name":"as shipped"');
      expect(JSON.stringify(snapshot?.frame)).toContain('the dock, as shipped');
      expect(JSON.stringify(snapshot?.trees['main'])).toContain('"title":"as shipped"');
      // The read is a snapshot entry: its answer is in the tree, and nothing
      // on the screen can still happen.
      expect(snapshot?.live).toBe(false);
      expect(snapshot?.drawnWith).toEqual(['words/all']);
    } finally {
      hosts.stop();
    }
  });

  it('shows another frame, other fragments and other entries when the running manifest answers those, with nothing else changed', async () => {
    const asked: ShellManifest[] = [];
    const hosts = buildShellHosts(
      partsWith({
        artifactsFor: (shell, roles, installed) => {
          asked.push(shell);
          return {
            ...shipped.artifactsFor(shell, roles, installed),
            frame: frameNamed('as published', true),
            layoutStore: { dock: dockSaying('the dock, as published') },
            fragments: { sheet: sheetNamed('as published') },
            entries: new Map([[wordsAll.fingerprint, { ...wordsAll, refresh: 'reactive' as const }]]),
          };
        },
      }),
    );
    try {
      const snapshot = await hosts.shells?.snapshot(null, null);

      // The frame, and what a `{ ref }` in it resolves to before anything
      // sets it.
      expect(JSON.stringify(snapshot?.frame)).toContain('"name":"as published"');
      expect(JSON.stringify(snapshot?.frame)).toContain('the dock, as published');
      expect(JSON.stringify(snapshot?.frame)).not.toContain('as shipped');
      // The fragment the canvas's first action is composed with.
      expect(JSON.stringify(snapshot?.trees['main'])).toContain('"title":"as published"');
      expect(JSON.stringify(snapshot?.trees['main'])).not.toContain('as shipped');
      // The entry behind the read: it keeps answering, so the screen is live.
      expect(snapshot?.live).toBe(true);
      expect(snapshot?.why).toEqual(['words: its read "load" keeps answering (words/all is reactive)']);
      // Asked for the app's own shell, as the app handed it over.
      expect(asked).toEqual([app.shell]);
    } finally {
      hosts.stop();
    }
  });

  it('a page’s host is asked for by the page’s own shell manifest', async () => {
    const asked: ShellManifest[] = [];
    const hosts = buildShellHosts(
      partsWith({
        artifactsFor: (shell, roles, installed) => {
          asked.push(shell);
          return { ...shipped.artifactsFor(shell, roles, installed), frame: frameNamed('the page, as published') };
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

// EVERY HOST IS ASKED. When what the app consists of changed, the server had
// its own host adopt and no page's: a page somebody had open kept the actions
// it was built with. And a principal's reset (`invalidateIdentity`) reached
// the shell the app's host keeps for them, and no shell a page had built for
// them.
describe('the shell hosts — a change reaches the living shells of every host', () => {
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const notes: ActionDefinition = { id: 'ext.notes', data: {}, layout: { component: 'Text', children: 'notes' } };
  const granting: NiscApp = { ...app, charter: { public: ['words', 'ext.*'] } };
  const top = (session: { shell: { getCanvasState: (canvas: string) => { stack: { definitionId: string }[] } } } | undefined): string | undefined =>
    session?.shell.getCanvasState('main').stack.at(-1)?.definitionId;

  it('when what the app consists of changes, the shells of the app’s host and of each page’s adopt', async () => {
    const running = createRunningManifest({ shipped: granting, grants: scopeGrants(['words']) });
    const hosts = buildShellHosts({ ...partsWith(running), app: granting });
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

  it('a principal’s reset reaches their shell in the app’s host and the ones a page built for them, and nobody else’s', async () => {
    const hosts = buildShellHosts(partsWith(shipped));
    try {
      const signals = buildSignals({ fabric: undefined, identity: { invalidate: () => true, invalidateTag: () => [] }, reset: hosts.reset, shells: hosts.shells });
      const page = hosts.pageAt('/docs')?.host;
      const sessions = [await hosts.shells?.session('t', 'usr_1'), await page?.session('t', 'usr_1'), await page?.session('t', 'usr_2')];
      const before = sessions.map((session) => session?.shell);

      expect(signals.invalidateIdentity('usr_1')).toBe(true);
      await settle();

      expect(sessions.map((session, index) => session?.shell === before[index])).toEqual([false, false, true]);
      // Somebody who holds no shell anywhere is answered for, and nothing is built.
      expect(hosts.reset('usr_nobody')).toBe(false);
    } finally {
      hosts.stop();
    }
  });
});
