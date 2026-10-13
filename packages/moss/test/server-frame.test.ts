import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { createRunningManifest } from '../src/artifactory';
import type { FunctionSession, NiscApp, SessionArtifacts } from '../src/manifest';
import { buildShellHosts } from '../src/server/hosts';
import type { Hosts } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';
import { rowsDouble } from './saved-double';
import { turn } from './turn';

const slot = (canvasId: string): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } });
const framed = (name: string, ...more: LayoutNode[]): LayoutNode => ({ component: 'Frame', props: { name }, children: [slot('main'), ...more] });
const inUse = (layout: LayoutNode): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'frame', layout, use: true } });
const words: ActionDefinition = { id: 'words', data: { title: 'Hello' }, layout: { component: 'Text', children: '$.title' } };
const shell = { canvases: [{ id: 'main', initial: 'words' }], layout: framed('as shipped') };

type Screen = { frame: () => string; canvases: () => string[]; lastOn: (canvas: string) => string | undefined; open: () => string | undefined; push: (canvas: string) => void };

const standing = (): { hosts: Hosts; published: SessionArtifacts; sessionOf: (principal: string) => FunctionSession; screenOf: (principal: string | null) => Promise<Screen> } => {
  const rows = rowsDouble();
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
    composeScope: (principal: string | null) => ({ userId: principal ?? 'anonymous' }),
  };
  const hosts = buildShellHosts({
    app,
    runtime: {},
    identity,
    running,
    savedAs: (scope) => rows.as(String(scope['userId'])),
    data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')), fingerprintsFor: async () => [] },
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    wrapWire: (inner) => inner,
    revokeSessions: undefined,
  });
  const signals = buildSignals({ fabric: undefined, identity: { invalidate: () => false, invalidateTag: () => [] }, reset: hosts.reset, deliver: hosts.deliver, adopt: hosts.adoptFor });
  running.onChange(hosts.adopt);
  running.onChangeFor(signals.adopt);
  return {
    hosts,
    published: running.publishedArtifacts(rows.as('*')),
    sessionOf: (principal) => {
      const session = sessions.get(principal);
      if (session === undefined) throw new Error(`no session was built for ${principal}`);
      return session;
    },
    screenOf: async (principal) => {
      const session = await hosts.shells?.session(principal === null ? null : 't', principal);
      const sent: string[] = [];
      session?.attach({ send: (text) => void sent.push(text), close: () => undefined });
      return {
        frame: () => sent.filter((text) => text.startsWith('{"type":"frame"')).at(-1) ?? '',
        canvases: () => Object.keys(session?.shell.getState().canvases ?? {}),
        lastOn: (canvas) => sent.filter((text) => text.startsWith(`{"type":"render","canvas":"${canvas}"`)).at(-1),
        open: () => session?.shell.getCanvasState('main').stack.at(-1)?.id,
        push: (canvas) => void session?.shell.push(canvas, 'words'),
      };
    },
  };
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await turn();
};

describe('a frame saved from a function’s session', () => {
  it('shows on its principal’s open screen at once, and on nobody else’s; the canvas it has a slot for is drawn once something is on it, and is gone with what is on it when the frame is taken back', async () => {
    const here = standing();
    try {
      const ada = await here.screenOf('ada');
      const ben = await here.screenOf('ben');
      await settle();
      const open = ada.open();

      const saved = await here.sessionOf('ada').artifacts.save([inUse(framed('as ada has it', slot('notes')))]);
      await settle();

      expect(ada.frame()).toContain('"name":"as ada has it"');
      expect(ada.frame()).toContain('"canvasId":"notes"');
      expect(ben.frame()).toContain('"name":"as shipped"');
      expect(ada.canvases()).toEqual(['main']);

      ada.push('notes');
      await settle();
      expect(ada.canvases()).toEqual(['main', 'notes']);
      expect(ada.lastOn('notes')).toContain('Hello');

      await here.sessionOf('ada').artifacts.reset('layout', saved.artifacts[0]?.id ?? '');
      await settle();

      expect(ada.frame()).toContain('"name":"as shipped"');
      expect(ada.canvases()).toEqual(['main']);
      expect(ada.lastOn('notes')).toBe('{"type":"render","canvas":"notes","tree":[]}');
      expect(ada.open()).toBe(open);
    } finally {
      here.hosts.stop();
    }
  });

  it('a shell that is built for somebody who has one in use starts with it, and loses the canvas the same way', async () => {
    const here = standing();
    try {
      await here.screenOf('ada');
      await settle();
      const saved = await here.sessionOf('ada').artifacts.save([inUse(framed('as ada has it', slot('notes')))]);
      here.hosts.reset('ada');
      const again = await here.screenOf('ada');
      await settle();
      expect(again.frame()).toContain('"name":"as ada has it"');

      again.push('notes');
      await settle();
      expect(again.canvases()).toEqual(['main', 'notes']);

      await here.sessionOf('ada').artifacts.reset('layout', saved.artifacts[0]?.id ?? '');
      await settle();
      expect(again.canvases()).toEqual(['main']);
    } finally {
      here.hosts.stop();
    }
  });

  it('put into a draft, it is in that one shell when the put answers, and gone with the draft, its canvas too', async () => {
    const here = standing();
    try {
      const ada = await here.screenOf('ada');
      await settle();

      await here.sessionOf('ada').draft.put([inUse(framed('as ada drafts it', slot('notes')))]);
      ada.push('notes');
      await settle();
      expect(ada.frame()).toContain('"name":"as ada drafts it"');
      expect(ada.canvases()).toEqual(['main', 'notes']);

      await here.sessionOf('ada').draft.discard();
      await settle();
      expect(ada.frame()).toContain('"name":"as shipped"');
      expect(ada.canvases()).toEqual(['main']);
    } finally {
      here.hosts.stop();
    }
  });

  it('one published for everybody shows on every open screen of the app’s own shell, nobody’s among them, under a person’s own', async () => {
    const here = standing();
    try {
      const ada = await here.screenOf('ada');
      const ben = await here.screenOf('ben');
      const nobody = await here.screenOf(null);
      await settle();
      await here.sessionOf('ada').artifacts.save([inUse(framed('as ada has it'))]);

      await here.published.save([inUse(framed('as published'))]);
      await settle();

      expect(ben.frame()).toContain('"name":"as published"');
      expect(nobody.frame()).toContain('"name":"as published"');
      expect(ada.frame()).toContain('"name":"as ada has it"');
    } finally {
      here.hosts.stop();
    }
  });
});
