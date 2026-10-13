import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { createRunningManifest } from '../src/artifactory';
import type { FunctionSession, NiscApp } from '../src/manifest';
import { buildShellHosts } from '../src/server/hosts';
import type { Hosts } from '../src/server/hosts';
import { buildSignals } from '../src/server/signals';
import { rowsDouble } from './saved-double';
import type { RowsDouble } from './saved-double';
import { turn } from './turn';

const saying = (text: string): LayoutNode => ({ component: 'Text', children: text });

const words: ActionDefinition = { id: 'words', data: { title: 'Hello' }, layout: { component: 'Text', children: '$.title' } };
const openDeals: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const closeDeal: SeedMutation = { fingerprint: 'deals/close', mutation: { op: 'update', table: 'deals', set: { open: false }, where: { eq: ['deals.id', { $context: 'id' }] } } };
const shell = { canvases: [{ id: 'main', initial: 'words' }], components: { Heading: {} } };
// A page of the same app: a shell of its own for each connection, which can draw what the app's shell cannot.
const page = { path: '/docs', canvases: [{ id: 'main', initial: 'words' }], components: { Carousel: {} } };

type Process = {
  hosts: Hosts;
  rows: RowsDouble;
  adoptAll: () => void;
  sessionOf: (principal: string | null) => Promise<{ session: FunctionSession; drawn: () => string }>;
  onThePage: (principal: string) => Promise<FunctionSession>;
  // What each of the next times somebody's identity is asked does, in order: it fails, or it waits to be let go.
  identityAsked: { next: ('fails' | 'waits' | 'answers')[]; letGo: (howMany?: number) => void };
  // Whether each of the next answers of what a shell is made of is held back once it is composed.
  composed: { next: ('held' | 'handed over')[]; letGo: () => void };
  running: ReturnType<typeof createRunningManifest>;
};

// A server's own wiring of hosts, the running manifest and the rows, with no database behind the rows.
const process = (rows: RowsDouble = rowsDouble()): Process => {
  const sessions = new Map<string | null, FunctionSession>();
  const app: NiscApp = {
    charter: { public: ['words', 'ext.*'] },
    actions: { words },
    entries: [openDeals, closeDeal],
    shell,
    pages: { docs: page },
    functions: (session) => {
      sessions.set(session.principal, session);
      return {};
    },
  };
  const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [shell, page] });
  const waiting: (() => void)[] = [];
  const identityAsked: Process['identityAsked'] = { next: [], letGo: (howMany = waiting.length) => waiting.splice(0, howMany).forEach((go) => go()) };
  const held: (() => void)[] = [];
  const composed: Process['composed'] = { next: [], letGo: () => held.splice(0).forEach((go) => go()) };
  const identity = {
    resolve: async () => {
      const does = identityAsked.next.shift();
      if (does === 'fails') throw new Error('who this is could not be asked');
      if (does === 'waits') await new Promise<void>((go) => waiting.push(go));
      return { roles: ['public'], scope: {}, installed: undefined, memoKey: 'public' };
    },
    composeScope: (principal: string | null) => ({ userId: principal ?? 'anonymous' }),
  };
  const hosts = buildShellHosts({
    app,
    runtime: {},
    identity,
    running: {
      ...running,
      artifactsFor: async (...asked) => {
        const made = await running.artifactsFor(...asked);
        if (composed.next.shift() === 'held') await new Promise<void>((go) => held.push(go));
        return made;
      },
    },
    savedAs: (scope) => rows.as(String(scope['userId'])),
    data: { answerIntent: async () => Promise.reject(new Error('no intent is asked here')), fingerprintsFor: async () => ['deals/open', 'deals/close'] },
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({ result: [] }), text: async () => '{"result":[]}' }),
    wrapWire: (inner) => inner,
    revokeSessions: undefined,
  });
  const signals = buildSignals({ fabric: undefined, identity: { invalidate: () => false, invalidateTag: () => [] }, reset: hosts.reset, deliver: hosts.deliver, adopt: hosts.adoptFor });
  running.onChange(hosts.adopt);
  running.onChangeFor(signals.adopt);
  return {
    hosts,
    rows,
    identityAsked,
    composed,
    running,
    adoptAll: hosts.adopt,
    sessionOf: async (principal) => {
      const opened = await hosts.shells?.session(principal === null ? null : 't', principal);
      const sent: string[] = [];
      opened?.attach({ send: (text) => void sent.push(text), close: () => undefined });
      const session = sessions.get(principal);
      if (session === undefined) throw new Error(`no session was built for ${principal}`);
      return { session, drawn: () => sent.filter((text) => text.startsWith('{"type":"render"')).at(-1) ?? '' };
    },
    onThePage: async (principal) => {
      await hosts.pageAt('/docs')?.host.session('t', principal);
      const session = sessions.get(principal);
      if (session === undefined) throw new Error(`no session was built for ${principal} on the page`);
      return session;
    },
  };
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await turn();
};

const stopping = async (here: Process, run: () => Promise<void>): Promise<void> => {
  try {
    await run();
  } finally {
    here.hosts.stop();
  }
};

const generated = (text: string): { kind: 'action'; body: unknown } => ({ kind: 'action', body: { layout: saying(text) } });

const GENERATED = /^generated\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('the draft of a function’s session', () => {
  it('what is put is in that shell when the put answers: it is opened on the next line, nothing was saved, and no other shell has it, another of the same person’s included', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      const ben = await here.sessionOf('ben');
      const adasPage = await here.onThePage('ada');
      await settle();

      const put = await ada.session.draft.put([generated('what the assistant drafted')]);
      const id = put.artifacts[0]?.id ?? '';
      ada.session.shell.push('main', id);
      await settle();

      expect(put).toEqual({ step: 1, artifacts: [{ kind: 'action', id: expect.stringMatching(GENERATED) }] });
      expect(ada.drawn()).toContain('what the assistant drafted');
      expect(() => ben.session.shell.push('main', id)).toThrow();
      expect(() => adasPage.shell.push('main', id)).toThrow();
      expect(here.rows.rows).toEqual([]);
      expect(ada.session.draft.list()).toEqual([{ kind: 'action', id, body: { id, layout: saying('what the assistant drafted') } }]);
      expect(ben.session.draft.list()).toEqual([]);
      expect(adasPage.draft.list()).toEqual([]);
      expect(await ada.session.artifacts.list()).toEqual([]);
    });
  });

  it('a layout in the draft is drawn over what the person saved and over the build’s, on that screen and with what was typed kept', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      await ada.session.artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: saying('as ada saved it'), use: true } }]);
      await settle();
      expect(ada.drawn()).toContain('as ada saved it');

      const open = ada.session.shell.getCanvasState('main').stack.at(-1)?.id ?? '';
      ada.session.shell.getRuntime(open)?.setData({ title: 'Typed since' });
      await ada.session.draft.put([{ kind: 'layout', body: { ref: 'action/words', layout: { component: 'Heading', children: '$.title' }, use: true } }]);
      await settle();
      expect(ada.drawn()).toContain('"name":"Heading"');
      expect(ada.drawn()).toContain('Typed since');
      expect(ada.session.shell.getCanvasState('main').stack.at(-1)?.id).toBe(open);

      await ada.session.draft.discard();
      await settle();
      expect(ada.drawn()).toContain('as ada saved it');
      expect(ada.session.draft.list()).toEqual([]);
    });
  });

  it('a put that names one the person saved is a new take of it in the draft: the saved one stands until the draft is saved, and is back when it is discarded', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const saved = await ada.session.artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: saying('as ada saved it'), use: true } }]);
      const id = saved.artifacts[0]?.id ?? '';
      const take = { kind: 'layout' as const, id, body: { ref: 'action/words', layout: saying('a new take of it'), use: true } };

      await ada.session.draft.put([take]);
      await settle();
      expect(ada.drawn()).toContain('a new take of it');
      expect((await ada.session.artifacts.history('layout', id)).map((version) => version.save)).toEqual([saved.save]);

      await ada.session.draft.discard();
      await settle();
      expect(ada.drawn()).toContain('as ada saved it');

      await ada.session.draft.put([take]);
      const kept = await ada.session.draft.save();
      await settle();
      expect(ada.drawn()).toContain('a new take of it');
      expect((await ada.session.artifacts.history('layout', id)).map((version) => version.save)).toEqual([kept.save, saved.save]);
    });
  });

  it('a call on the draft of a shell that was replaced since says so', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      here.hosts.reset('ada');
      await settle();

      const gone = 'moss: this session’s shell is gone, and its draft with it.';
      await expect(ada.session.draft.put([generated('too late')])).rejects.toThrow(gone);
      await expect(ada.session.draft.save()).rejects.toThrow(gone);
      await expect(ada.session.draft.discard()).rejects.toThrow(gone);
      expect(() => ada.session.draft.list()).toThrow(gone);
    });
  });

  it('a put that is being taken when its shell is replaced says the shell is gone', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();

      // The put is checked, and the shell asks for itself with the draft and waits.
      here.identityAsked.next = ['answers', 'waits'];
      const putting = ada.session.draft.put([generated('put into a shell that is replaced meanwhile')]);
      const refused = expect(putting).rejects.toThrow('moss: this session’s shell is gone, and its draft with it.');
      await settle();
      here.hosts.reset('ada');
      await settle();
      here.identityAsked.letGo();

      await refused;
    });
  });

  it('what was in the draft of a shell that was replaced is saved by nobody', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      await ada.session.draft.put([generated('drafted, then the shell was replaced')]);
      here.hosts.reset('ada');
      await settle();

      await expect(ada.session.draft.save()).rejects.toThrow('moss: this session’s shell is gone, and its draft with it.');
      expect(here.rows.rows).toEqual([]);
    });
  });

  it('a shell that takes the place of one with a draft has none of it, whatever was asked for the old one meanwhile', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const put = await ada.session.draft.put([generated('drafted in the old shell')]);

      // The build of the new shell waits. An adopt asks for the old shell, with its draft, and waits too.
      here.identityAsked.next = ['waits'];
      here.hosts.reset('ada');
      await turn();
      here.identityAsked.next = ['waits'];
      here.adoptAll();
      // The new shell is built and takes the old one's place; the adopt it starts for itself waits.
      here.identityAsked.next = ['waits'];
      here.identityAsked.letGo(1);
      await settle();
      // The adopt that was asked for the old shell is answered now.
      here.identityAsked.letGo(1);
      await settle();
      here.identityAsked.letGo();
      await settle();
      const again = await here.sessionOf('ada');

      expect(() => again.session.shell.push('main', put.artifacts[0]?.id ?? '')).toThrow();
      expect(again.session.draft.list()).toEqual([]);
    });
  });

  it('a change that is asked for while a put is taken and answered after it is asked for again with the draft: the put stays', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();

      // The put is checked, and the shell asks for itself with the draft and waits.
      here.identityAsked.next = ['answers', 'waits'];
      const putting = ada.session.draft.put([generated('put while the app changed')]);
      await settle();
      // A change to the app is asked for meanwhile, with the draft as it still is, and waits too.
      here.identityAsked.next = ['waits'];
      here.adoptAll();
      here.identityAsked.letGo(1);
      const put = await putting;
      here.identityAsked.letGo();
      await settle();

      expect(() => ada.session.shell.push('main', put.artifacts[0]?.id ?? '')).not.toThrow();
    });
  });

  it('a put that was composed before a change the shell has adopted since is composed again: the shell keeps the change and has the put', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const notes: ActionDefinition = { id: 'ext.notes', layout: saying('handed over while the put was taken') };

      // What the shell is made of with the put is composed, and held back.
      here.composed.next = ['held'];
      const putting = ada.session.draft.put([generated('put before the app changed')]);
      await settle();
      // The app changes, and the shell adopts that.
      here.running.replace('extras', { 'ext.notes': notes });
      await settle();
      here.composed.letGo();
      const put = await putting;
      await settle();

      expect(() => ada.session.shell.push('main', 'ext.notes')).not.toThrow();
      expect(() => ada.session.shell.push('main', put.artifacts[0]?.id ?? '')).not.toThrow();
    });
  });

  it('calls on one draft are taken in turn: two puts at once are two steps, and a put during a save is the first of a new draft', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const draft = ada.session.draft;

      const [first, second] = await Promise.all([draft.put([generated('one')]), draft.put([generated('two')])]);
      expect([first.step, second.step]).toEqual([1, 2]);
      expect(draft.list().map((drafted) => drafted.id)).toEqual([first.artifacts[0]?.id, second.artifacts[0]?.id]);
      expect(() => ada.session.shell.push('main', first.artifacts[0]?.id ?? '')).not.toThrow();

      const [saved, third] = await Promise.all([draft.save(), draft.put([generated('three')])]);
      expect(saved.artifacts.map((artifact) => artifact.id)).toEqual([first.artifacts[0]?.id, second.artifacts[0]?.id]);
      expect(third.step).toBe(1);
      expect(draft.list().map((drafted) => drafted.id)).toEqual([third.artifacts[0]?.id]);

      await draft.put([generated('four')]);
      await Promise.all([draft.show(2), draft.show(1)]);
      expect(draft.list().map((drafted) => drafted.id)).toEqual([third.artifacts[0]?.id]);
    });
  });

  it('a put that marks a layout in use takes the mark off the draft’s others for that ref, as a save does', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const take = (text: string): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'action/words', layout: saying(text), use: true } });

      const first = await ada.session.draft.put([take('the first take')]);
      const second = await ada.session.draft.put([take('the second take')]);
      await settle();

      expect(ada.drawn()).toContain('the second take');
      expect(ada.session.draft.list()).toEqual([
        { kind: 'layout', id: first.artifacts[0]?.id, body: { ref: 'action/words', layout: saying('the first take') } },
        { kind: 'layout', id: second.artifacts[0]?.id, body: { ref: 'action/words', layout: saying('the second take'), use: true } },
      ]);
    });
  });

  it('a fragment in the draft is one an action is opened with on the next line', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();

      const put = await ada.session.draft.put([{ kind: 'fragment', body: { layout: { component: 'Heading', children: [{ slot: 'body' }] } } }]);
      ada.session.shell.push('main', 'words', undefined, [put.artifacts[0]?.id ?? '']);
      await settle();

      expect(ada.drawn()).toContain('"name":"Heading"');
    });
  });

  it('each put or removal is a numbered step, the shell shows the draft as it was after a step, and a put after that goes on from there', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const draft = ada.session.draft;
      const layout = (text: string, id?: string): { kind: 'layout'; id?: string; body: unknown } => ({
        kind: 'layout',
        ...(id === undefined ? {} : { id }),
        body: { ref: 'action/words', layout: saying(text), use: true },
      });

      const first = await draft.put([layout('the first take')]);
      const id = first.artifacts[0]?.id ?? '';
      const second = await draft.put([layout('the second take', id)]);
      expect([first.step, second.step]).toEqual([1, 2]);
      expect(draft.list().map((drafted) => drafted.id)).toEqual([id]);
      await settle();
      expect(ada.drawn()).toContain('the second take');

      await draft.show(1);
      await settle();
      expect(ada.drawn()).toContain('the first take');
      expect(draft.list()).toHaveLength(1);

      await draft.show(0);
      await settle();
      expect(ada.drawn()).toContain('Hello');
      expect(draft.list()).toEqual([]);

      await draft.show(1);
      const third = await draft.put([layout('the third take', id)]);
      expect(third.step).toBe(2);
      await settle();
      expect(ada.drawn()).toContain('the third take');
      await expect(draft.show(3)).rejects.toThrow('moss: the draft has no step 3. Its steps: 0 to 2.');

      const removed = await draft.remove('layout', id);
      expect(removed.step).toBe(3);
      await settle();
      expect(ada.drawn()).toContain('Hello');
      await expect(draft.remove('layout', id)).rejects.toThrow(`moss: no layout "${id}" is in the draft.`);
    });
  });

  it('`save` is one save of everything in it, as the person’s own and under the ids it had; the draft is then empty and the shell keeps what it shows', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      const ben = await here.sessionOf('ben');
      await settle();
      const action = await ada.session.draft.put([generated('a screen to keep')]);
      const id = action.artifacts[0]?.id ?? '';
      const layout = await ada.session.draft.put([{ kind: 'layout', body: { ref: `action/${id}`, layout: saying('and its layout, redone'), use: true } }]);
      ada.session.shell.push('main', id);
      await settle();
      expect(ada.drawn()).toContain('and its layout, redone');

      const saved = await ada.session.draft.save();
      await settle();

      expect(saved.artifacts).toEqual([
        { kind: 'action', id },
        { kind: 'layout', id: layout.artifacts[0]?.id },
      ]);
      expect(here.rows.rows.map((row) => [row.principal, row.kind, row.id, row.save])).toEqual([
        ['ada', 'action', id, saved.save],
        ['ada', 'layout', layout.artifacts[0]?.id, saved.save],
      ]);
      expect(ada.session.draft.list()).toEqual([]);
      expect(ada.drawn()).toContain('and its layout, redone');
      expect((await ada.session.artifacts.list('action')).map((version) => version.id)).toEqual([id]);
      expect(() => ben.session.shell.push('main', id)).toThrow();
      await expect(ada.session.draft.save()).rejects.toThrow('moss: the draft holds nothing to save.');
    });
  });

  it('is gone when the shell is: after a reset the shell has none of it', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const put = await ada.session.draft.put([generated('gone with the shell')]);
      const id = put.artifacts[0]?.id ?? '';

      here.hosts.reset('ada');
      await settle();
      const again = await here.sessionOf('ada');

      expect(again.session.draft.list()).toEqual([]);
      expect(() => again.session.shell.push('main', id)).toThrow();
    });
  });

  it('a change to what the app consists of leaves the draft in the shell: one asked for before a put and answered after it, and one after', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();

      // The adopt asks who this is and waits; the put is asked for, checked and taken meanwhile.
      here.identityAsked.next = ['waits'];
      here.adoptAll();
      const put = await ada.session.draft.put([generated('still here')]);
      here.identityAsked.letGo();
      await settle();
      expect(() => ada.session.shell.push('main', put.artifacts[0]?.id ?? '')).not.toThrow();

      ada.session.shell.pop('main');
      here.adoptAll();
      await settle();
      expect(() => ada.session.shell.push('main', put.artifacts[0]?.id ?? '')).not.toThrow();
    });
  });

  it('a take in the draft that is not marked in use takes the saved one it stands in for off the screen', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const saved = await ada.session.artifacts.save([{ kind: 'layout', body: { ref: 'action/words', layout: saying('as ada saved it'), use: true } }]);
      await settle();
      expect(ada.drawn()).toContain('as ada saved it');

      await ada.session.draft.put([{ kind: 'layout', id: saved.artifacts[0]?.id, body: { ref: 'action/words', layout: saying('as ada saved it') } }]);
      await settle();

      expect(ada.drawn()).toContain('Hello');
      expect(ada.drawn()).not.toContain('as ada saved it');
    });
  });
});

describe('what is refused of a draft, with the draft left as it was', () => {
  it('what a save refuses: a kind, a body, an id that is neither in the draft nor the person’s, a write, two layouts of one put marked in use for one ref; and what this one shell cannot draw, though another of the app’s can', async () => {
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const draft = ada.session.draft;
      const kept = await draft.put([generated('the one that stays')]);

      await expect(draft.put([{ kind: 'entry' as 'action', body: {} }])).rejects.toThrow('moss: "entry" is not a kind that is saved. The kinds: layout, action, fragment.');
      await expect(draft.put([{ kind: 'action', body: { layout: { component: 'Carousel' } } }])).rejects.toThrow(
        'moss: the action is refused: layout uses "Carousel", which this app has no component for',
      );
      await expect(draft.put([{ kind: 'action', id: 'generated.somebody-elses', body: { layout: saying('x') } }])).rejects.toThrow(
        'moss: there is no action "generated.somebody-elses" of yours. Leave the id out, and moss gives a new action its id.',
      );
      await expect(
        draft.put([{ kind: 'action', body: { endpoints: { close: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/close' } } }, layout: saying('x') } }]),
      ).rejects.toThrow('moss: the action is refused: endpoint "close" replays "deals/close", which is a write, and what is generated only reads');
      const marked = (text: string): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'action/words', layout: saying(text), use: true } });
      await expect(draft.put([marked('one'), marked('two')])).rejects.toThrow('moss: two layouts of one save are marked in use for "action/words". One is in use at a time.');
      await expect(draft.put([{ kind: 'layout', body: { ref: 'action/words', layout: { component: 'Carousel' } } }])).rejects.toThrow(
        'moss: the layout for "action/words" is refused: layout uses "Carousel", which this app has no component for',
      );

      expect(draft.list().map((drafted) => drafted.id)).toEqual([kept.artifacts[0]?.id]);
      expect(here.rows.rows).toEqual([]);
    });
  });

  it('a put the shell could not take: the draft is as it was, and nothing of the put reaches the screen, at once or at a later change', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const here = process();
    await stopping(here, async () => {
      const ada = await here.sessionOf('ada');
      await settle();
      const first = await ada.session.draft.put([generated('the first')]);

      // The check asks who this is and is answered; the shell, taking the put, asks again and is not.
      here.identityAsked.next = ['answers', 'fails'];
      const refused = ada.session.draft.put([{ kind: 'layout', body: { ref: 'action/words', layout: saying('a look that was not taken'), use: true } }]);
      await expect(refused).rejects.toThrow('who this is could not be asked');
      here.adoptAll();
      await settle();

      expect(ada.session.draft.list().map((drafted) => drafted.id)).toEqual([first.artifacts[0]?.id]);
      expect(ada.drawn()).not.toContain('a look that was not taken');
      const next = await ada.session.draft.put([generated('the third')]);
      expect(next.step).toBe(2);
    });
    said.mockRestore();
  });

  it('a session nobody is signed in to has no draft, as it saves nothing', async () => {
    const here = process();
    await stopping(here, async () => {
      const nobody = await here.sessionOf(null);
      await expect(nobody.session.draft.put([generated('anybody’s')])).rejects.toThrow('moss: nobody is signed in to this session, and a draft is somebody’s to save.');
      expect(nobody.session.draft.list()).toEqual([]);
    });
  });
});
