import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { createRunningManifest, savedRowsOver } from '../src/artifactory';
import type { RunningManifest } from '../src/artifactory';
import type { ShellArtifacts } from '../src/artifactory/artifacts';
import { createGrammarUpgrader } from '../src/data/engine';
import type { NiscApp, SessionArtifacts, ShellManifest } from '../src/manifest';
import { rowsDouble } from './saved-double';
import type { RowsDouble } from './saved-double';

const saying = (text: string): LayoutNode => ({ component: 'Text', children: text });

const home: ActionDefinition = { id: 'home', layout: saying('home') };
const desk: ActionDefinition = { id: 'desk', layout: saying('desk') };

const openDeals: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const closeDeal: SeedMutation = { fingerprint: 'deals/close', mutation: { op: 'update', table: 'deals', set: { open: false }, where: { eq: ['deals.id', { $context: 'id' }] } } };
const salaries: SeedEntry = { fingerprint: 'salaries/all', dsl: { from: ['salaries'], fields: ['salaries.id'] } };

const SHELL: ShellManifest = { canvases: [{ id: 'main', initial: 'home' }], components: { Button: {} }, fragments: { sheet: { kind: 'fragment', id: 'sheet', layout: { component: 'Stack', children: [{ slot: 'body' }] } } } };

const app: NiscApp = {
  charter: { public: ['home'], member: { actions: ['home'] }, lead: { extends: ['member'], actions: ['desk'] } },
  actions: { home, desk },
  entries: [openDeals, closeDeal, salaries],
  shell: SHELL,
};

// What a member's policy lets them replay: the deals, and not the salaries.
const MEMBERS = ['deals/open', 'deals/close'];

const GENERATED = /^generated\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const reading = (fingerprint: string, more: Partial<ActionDefinition> = {}): Omit<ActionDefinition, 'id'> => ({
  data: { rows: [] },
  endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint }, target: 'rows' } },
  lifecycle: { mount: [{ call: 'load' }] },
  layout: saying('the open deals'),
  ...more,
});

type World = {
  running: RunningManifest;
  rows: RowsDouble;
  of: (principal: string | null, roles?: readonly string[], replayable?: readonly string[]) => SessionArtifacts;
  shellOf: (principal: string, roles?: readonly string[], replayable?: readonly string[]) => Promise<ShellArtifacts>;
};

const world = (rows: RowsDouble = rowsDouble()): World => {
  const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [SHELL] });
  return {
    running,
    rows,
    of: (principal, roles = ['member'], replayable = MEMBERS) =>
      running.sessionArtifacts(principal, async () => ({ roles, installed: undefined, saved: rows.as(principal ?? 'nobody'), replayable: async () => replayable })),
    shellOf: (principal, roles = ['member'], replayable = MEMBERS) =>
      running.artifactsFor(SHELL, { principal, roles, installed: undefined, saved: rows.as(principal), replayable: async () => replayable }),
  };
};

const saidWhile = async (run: (said: ReturnType<typeof vi.spyOn>) => Promise<void>): Promise<void> => {
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await run(said);
  } finally {
    said.mockRestore();
  }
};

describe('a generated action saved from a session', () => {
  it('gets its id from moss, and is in its owner’s shell with its layout under its ref, and in nobody else’s and in no catalog', async () => {
    const { of, shellOf, rows, running } = world();
    const saved = await of('ada').save([{ kind: 'action', body: reading('deals/open') }]);
    const id = saved.artifacts[0]?.id ?? '';

    expect(saved.artifacts).toEqual([{ kind: 'action', id: expect.stringMatching(GENERATED) }]);
    const adas = await shellOf('ada');
    expect(adas.actions[id]).toEqual({ id, ...reading('deals/open'), layout: { ref: `action/${id}` } });
    expect(adas.layoutStore[`action/${id}`]).toEqual(saying('the open deals'));
    expect(adas.actions['home']).toBeDefined();
    const bens = await shellOf('ben');
    expect(Object.keys(bens.actions)).toEqual(['home']);
    expect(Object.keys(bens.layoutStore)).not.toContain(`action/${id}`);
    expect(rows.rows.map((row) => [row.principal, row.kind, row.id])).toEqual([['ada', 'action', id]]);
    expect(rows.rows[0]?.body).toMatchObject({ id });
    expect(running.catalogFor(['member'], undefined).ids).toEqual(['home']);
  });

  it('replays a read that was handed over while the app runs, as one the app shipped', async () => {
    const { of, running } = world();
    await running.replaceEntries('extras', [{ fingerprint: 'ext/deals', dsl: { from: ['deals'], fields: ['deals.id'] } }]);

    await expect(of('ada', ['member'], ['ext/deals']).save([{ kind: 'action', body: reading('ext/deals') }])).resolves.toBeDefined();
  });

  it('is listed, has a history, and a save that names its id is a new version of it', async () => {
    const { of, shellOf } = world();
    const ada = of('ada');
    const first = await ada.save([{ kind: 'action', body: reading('deals/open') }]);
    const id = first.artifacts[0]?.id ?? '';
    const second = await ada.save([{ kind: 'action', id, body: { id, ...reading('deals/open'), layout: saying('the open deals, again') } }]);

    expect((await ada.list('action')).map((version) => [version.kind, version.id, version.save])).toEqual([['action', id, second.save]]);
    expect(await ada.list('layout')).toEqual([]);
    expect((await ada.history('action', id)).map((version) => version.save)).toEqual([second.save, first.save]);
    expect((await shellOf('ada')).layoutStore[`action/${id}`]).toEqual(saying('the open deals, again'));
  });

  it('may open the actions its owner holds, their own generated ones among them, and no other', async () => {
    const { of, shellOf } = world();
    const ada = of('ada');
    const first = await ada.save([{ kind: 'action', body: reading('deals/open') }]);
    const id = first.artifacts[0]?.id ?? '';
    const opening = (action: string): Omit<ActionDefinition, 'id'> => ({ layout: { component: 'Button', ref: 'go' }, triggers: [{ event: 'ui:click', ref: 'go', do: [{ push: { action } }] }] });

    const opener = await ada.save([{ kind: 'action', body: opening(id) }, { kind: 'action', body: opening('home') }]);
    expect(Object.keys((await shellOf('ada')).actions).sort()).toEqual(['home', id, ...opener.artifacts.map((artifact) => artifact.id)].sort());

    await expect(ada.save([{ kind: 'action', body: opening('desk') }])).rejects.toThrow('moss: the action is refused: step pushes action "desk" which is not in the catalog');
    await expect(of('lea', ['lead']).save([{ kind: 'action', body: opening('desk') }])).resolves.toBeDefined();
    await expect(of('ben').save([{ kind: 'action', body: opening(id) }])).rejects.toThrow(`moss: the action is refused: step pushes action "${id}" which is not in the catalog`);
  });

  it('a layout of its owner’s for it is saved and drawn as one for a shipped action is, and nobody else can save one for it', async () => {
    const { of, shellOf } = world();
    const saved = await of('ada').save([{ kind: 'action', body: reading('deals/open') }]);
    const ref = `action/${saved.artifacts[0]?.id ?? ''}`;

    await of('ada').save([{ kind: 'layout', body: { ref, layout: saying('as ada has it now'), use: true } }]);
    expect((await shellOf('ada')).layoutStore[ref]).toEqual(saying('as ada has it now'));
    await expect(of('ben').save([{ kind: 'layout', body: { ref, layout: saying('as ben would have it') } }])).rejects.toThrow(`nothing is kept under "${ref}"`);
  });
});

describe('a shell for nobody signed in', () => {
  it('holds nothing anybody generated, whatever rows are handed over with it', async () => {
    const { of, running, rows } = world();
    await of('ada').save([{ kind: 'action', body: reading('deals/open') }]);
    await of('ada').save([{ kind: 'layout', body: { ref: 'action/home', layout: saying('home, as ada has it'), use: true } }]);

    const nobodys = await running.artifactsFor(SHELL, { principal: null, roles: ['public'], installed: undefined, saved: rows.as('ada') });

    expect(Object.keys(nobodys.actions)).toEqual(['home']);
    expect(nobodys.layoutStore['action/home']).toEqual(home.layout);
  });
});

describe('reset, and going back', () => {
  it('a reset takes the action out of its owner’s shell and its layouts with it, and nothing is said; going back brings both, and the layouts stay listed meanwhile', () =>
    saidWhile(async (said) => {
    const { of, shellOf } = world();
    const ada = of('ada');
    const saved = await ada.save([{ kind: 'action', body: reading('deals/open') }]);
    const id = saved.artifacts[0]?.id ?? '';
    const ref = `action/${id}`;
    const layout = await ada.save([{ kind: 'layout', body: { ref, layout: saying('as ada has it now'), use: true } }]);

    await ada.reset('action', id);

    const without = await shellOf('ada');
    expect(Object.keys(without.actions)).toEqual(['home']);
    expect(Object.keys(without.layoutStore)).not.toContain(ref);
    expect(await ada.list('action')).toEqual([]);
    expect((await ada.list('layout')).map((version) => version.id)).toEqual([layout.artifacts[0]?.id]);

    await ada.restore('action', id, saved.save);

    const again = await shellOf('ada');
    expect(again.actions[id]).toBeDefined();
    expect(again.layoutStore[ref]).toEqual(saying('as ada has it now'));
    expect(said).not.toHaveBeenCalled();
    }));
});

describe('what is refused of a generated action, in a sentence, with nothing written', () => {
  const refused = async (body: unknown, sentence: string | RegExp, roles: readonly string[] = ['member'], replayable: readonly string[] = MEMBERS): Promise<void> => {
    const { of, rows } = world();
    await expect(of('ada', roles, replayable).save([{ kind: 'action', body }])).rejects.toThrow(sentence);
    expect(rows.rows).toEqual([]);
  };
  const calling = (endpoint: unknown): unknown => ({ ...reading('deals/open'), endpoints: { load: endpoint } });

  it('an id of its own choosing', () =>
    refused({ id: 'home', ...reading('deals/open') }, 'moss: the action is refused: it names the id "home". Moss gives what is generated its id: leave it out.'));

  it('a body that is no action nova reads', async () => {
    await refused({ ...reading('deals/open'), triggers: 'none' }, /^moss: the action is refused: triggers: /);
    await refused('an action', /^moss: the action is refused: /);
  });

  it('a function', () =>
    refused(calling({ fn: 'deals.close', target: 'rows' }), 'moss: the action is refused: endpoint "load" calls the function "deals.close", and what is generated calls no function'));

  it('a write', () => refused(reading('deals/close'), 'moss: the action is refused: endpoint "load" replays "deals/close", which is a write, and what is generated only reads'));

  it('a read its owner may not replay', async () => {
    await refused(reading('salaries/all'), 'moss: the action is refused: endpoint "load" replays "salaries/all", which its owner may not replay');
    await refused(reading('deals/open'), 'moss: the action is refused: endpoint "load" replays "deals/open", which its owner may not replay', ['member'], []);
  });

  it('a fingerprint that is no entry the app ships or was handed: a query a model wrote among them', () =>
    refused(reading('fp_0123456789abcdef'), 'moss: the action is refused: endpoint "load" replays "fp_0123456789abcdef", which is no entry the app ships or was handed', ['member'], [...MEMBERS, 'fp_0123456789abcdef']));

  it('a fingerprint that is not written out', () =>
    refused(calling({ url: '/api/vex', method: 'POST', request: { fingerprint: { $ref: '$.which' } }, target: 'rows' }), 'moss: the action is refused: endpoint "load" names no fingerprint'));

  it('any call that is not a POST to the app’s vex route', async () => {
    const elsewhere = (method: string, url: string): string => `moss: the action is refused: endpoint "load" calls "${method} ${url}", and what is generated calls only the app’s vex route, with POST`;
    await refused(calling({ url: '/catalog', method: 'GET', target: 'rows' }), elsewhere('GET', '/catalog'));
    await refused(calling({ url: '/api/vex', method: 'GET', target: 'rows' }), elsewhere('GET', '/api/vex'));
    await refused(calling({ url: 'https://elsewhere.example/api/vex', method: 'POST', request: { fingerprint: 'deals/open' } }), elsewhere('POST', 'https://elsewhere.example/api/vex'));
    await refused(calling({ url: '/api/{{$.where}}/vex', method: 'POST', request: { fingerprint: 'deals/open' } }), elsewhere('POST', '/api/{{$.where}}/vex'));
    await refused(calling({ url: '/integrations/acme/anything', method: 'POST', request: { fingerprint: 'deals/open' } }), elsewhere('POST', '/integrations/acme/anything'));
  });

  it('a read through a resource’s vex route is a read like any other', async () => {
    const { of } = world();
    await expect(of('ada').save([{ kind: 'action', body: calling({ url: '/api/sales/vex', method: 'POST', request: { fingerprint: 'deals/open' }, target: 'rows' }) }])).resolves.toBeDefined();
  });

  it('what a saved layout is refused for: a component the app has none for, a ref under `action/`, and what nova’s audit finds', async () => {
    await refused({ layout: { component: 'Carousel' } }, 'moss: the action is refused: layout uses "Carousel", which this app has no component for');
    await refused({ layout: { component: 'Stack', children: [{ ref: 'action/home' }] } }, 'moss: the action is refused: it names the layout "action/home"');
    await refused({ layout: 'action/home' }, 'moss: the action is refused: it names the layout "action/home"');
    await refused({ layout: { component: 'Stack', children: [{ ref: 'frame' }] } }, 'moss: the action is refused: it names the layout "frame"');
    await refused({ layout: 'canvas/main' }, 'moss: the action is refused: it names the layout "canvas/main"');
    await refused({ layout: { component: 'Text', children: '$.missing' } }, 'moss: the action is refused: layout binds "$.missing" but data has no "missing" default');
  });

  it('an id that is not one of their actions: a layout’s, or another’s action', async () => {
    const { of } = world();
    const adas = await of('ada').save([{ kind: 'action', body: reading('deals/open') }]);
    const layout = await of('ben').save([{ kind: 'layout', body: { ref: 'action/home', layout: saying('ben’s') } }]);

    await expect(of('ben').save([{ kind: 'action', id: adas.artifacts[0]?.id, body: reading('deals/open') }])).rejects.toThrow(`moss: there is no action "${adas.artifacts[0]?.id}" of yours.`);
    await expect(of('ben').save([{ kind: 'action', id: layout.artifacts[0]?.id, body: reading('deals/open') }])).rejects.toThrow(`moss: there is no action "${layout.artifacts[0]?.id}" of yours.`);
    await expect(of('ben').reset('action', adas.artifacts[0]?.id ?? '')).rejects.toThrow(`moss: no action "${adas.artifacts[0]?.id}" of yours is in force.`);
    await expect(of('ben').reset('action', layout.artifacts[0]?.id ?? '')).rejects.toThrow(`moss: no action "${layout.artifacts[0]?.id}" of yours is in force.`);
    await expect(of('ada').reset('layout', adas.artifacts[0]?.id ?? '')).rejects.toThrow(`moss: no layout "${adas.artifacts[0]?.id}" of yours is in force.`);
  });

  it('in a session nobody is signed in to', async () => {
    const { of, rows } = world();
    await expect(of(null, ['public']).save([{ kind: 'action', body: { layout: saying('anybody’s') } }])).rejects.toThrow('moss: nobody is signed in to this session, and a save is somebody’s.');
    expect(rows.rows).toEqual([]);
  });
});

describe('a generated action that does not pass any more', () => {
  it('is left out of its owner’s shell with a line, and a layout for it is not loaded', () =>
    saidWhile(async (said) => {
      const { of, shellOf } = world();
      const saved = await of('ada').save([{ kind: 'action', body: reading('deals/open') }]);
      const id = saved.artifacts[0]?.id ?? '';
      await of('ada').save([{ kind: 'layout', body: { ref: `action/${id}`, layout: saying('as ada has it now'), use: true } }]);

      const demoted = await shellOf('ada', ['member'], []);

      expect(Object.keys(demoted.actions)).toEqual(['home']);
      expect(Object.keys(demoted.layoutStore)).not.toContain(`action/${id}`);
      expect(said.mock.calls).toEqual([[`[moss] the action "${id}" of ada is left out: endpoint "load" replays "deals/open", which its owner may not replay`]]);
    }));

  it('is said when a shell is built, and not when its owner saves something else', () =>
    saidWhile(async (said) => {
      const { of } = world();
      await of('ada').save([{ kind: 'action', body: reading('deals/open') }]);

      await of('ada', ['member'], []).save([{ kind: 'layout', body: { ref: 'action/home', layout: saying('home, as ada has it') } }]);

      expect(said).not.toHaveBeenCalled();
    }));

  it('a version the rows could not read is left out the same way', () =>
    saidWhile(async (said) => {
      const rows = rowsDouble();
      await rows.as('ada').write({ id: 'a-save', versions: [{ kind: 'action', id: 'generated.newer', body: { id: 'generated.newer', layout: saying('from a newer grammar') }, copiedFrom: null }] });
      const unread = rows.rows[0];
      if (unread !== undefined) unread.unread = 'it was written in a newer grammar than this server runs';

      expect(Object.keys((await world(rows).shellOf('ada')).actions)).toEqual(['home']);
      expect(said.mock.calls).toEqual([['[moss] the action "generated.newer" of ada is left out: it was written in a newer grammar than this server runs']]);
    }));
});

describe('what was saved under another grammar of nova’s', () => {
  it('is brought to the grammars this server runs where it is read: an action or a fragment written under a newer one is not read', async () => {
    for (const kind of ['action', 'fragment']) {
      const stored = { save: '0b0e7a52-6f0e-4b8e-9d0c-1f2e3a4b5c6d', kind, id: 'generated.newer', body: { id: 'generated.newer' }, grammar: { 'nisc.nova': 9999 }, copied_from: null, created_at: new Date(0) };
      const rowsOf = savedRowsOver(async () => [stored], await createGrammarUpgrader({}));

      expect((await rowsOf.of({ userId: 'ada' }).inForce())[0]?.unread).toEqual(expect.any(String));
    }
  });
});

describe('a generated fragment', () => {
  const chrome = { kind: 'fragment', layout: { component: 'Stack', children: [saying('a heading of ada’s'), { slot: 'body' }] } };

  it('gets its id from moss, and is among the fragments of its owner’s shell and of nobody else’s', async () => {
    const { of, shellOf } = world();
    const saved = await of('ada').save([{ kind: 'fragment', body: chrome }]);
    const id = saved.artifacts[0]?.id ?? '';

    expect(saved.artifacts).toEqual([{ kind: 'fragment', id: expect.stringMatching(GENERATED) }]);
    expect((await shellOf('ada')).fragments).toEqual({ ...SHELL.fragments, [id]: { ...chrome, id } });
    expect((await shellOf('ben')).fragments).toEqual(SHELL.fragments);
    expect((await of('ada').list('fragment')).map((version) => version.id)).toEqual([id]);

    await of('ada').reset('fragment', id);
    expect((await shellOf('ada')).fragments).toEqual(SHELL.fragments);
  });

  it('is held to what a generated action is held to: its id, what it calls, and what its layout names', async () => {
    const { of, rows } = world();
    const refusedOf = (body: unknown): Promise<unknown> => of('ada').save([{ kind: 'fragment', body }]);

    await expect(refusedOf({ ...chrome, id: 'sheet' })).rejects.toThrow('moss: the fragment is refused: it names the id "sheet". Moss gives what is generated its id: leave it out.');
    await expect(refusedOf({ ...chrome, endpoints: { close: { fn: 'deals.close' } } })).rejects.toThrow(
      'moss: the fragment is refused: endpoint "close" calls the function "deals.close", and what is generated calls no function',
    );
    await expect(refusedOf({ kind: 'fragment', layout: { component: 'Carousel' } })).rejects.toThrow('moss: the fragment is refused: layout uses "Carousel", which this app has no component for');
    await expect(refusedOf({ layout: saying('no kind') })).resolves.toBeDefined();
    await expect(refusedOf({ kind: 'action', layout: saying('another kind') })).rejects.toThrow(/^moss: the fragment is refused: kind: /);
    expect(rows.rows).toHaveLength(1);
  });
});

describe('what is published for everybody', () => {
  it('is a layout and no other kind', async () => {
    const rows = rowsDouble();
    const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [SHELL], published: () => rows.as('*').inForce() });
    const published = running.publishedArtifacts(rows.as('*'));

    await expect(published.save([{ kind: 'action', body: reading('deals/open') }])).rejects.toThrow('moss: "action" is not a kind that is saved. The kinds: layout.');
    await expect(published.save([{ kind: 'fragment', body: { kind: 'fragment' } }])).rejects.toThrow('moss: "fragment" is not a kind that is saved. The kinds: layout.');
    await expect(published.list('action')).rejects.toThrow('moss: "action" is not a kind that is saved. The kinds: layout.');
    expect(rows.rows).toEqual([]);
  });
});

describe('the ids moss gives to what is generated', () => {
  const generatedId: ActionDefinition = { id: 'generated.by-the-app', layout: saying('shipped under a generated id') };

  it('are held to the id a definition carries as to the one it is listed under', () => {
    const { running } = world();
    expect(() => running.replace('extras', { listedOtherwise: generatedId })).toThrow('"generated.by-the-app" begins with "generated.", which is where what somebody generated is kept');
  });

  it('are not an app’s to ship or to hand over', () => {
    const shipping = (): unknown => createRunningManifest({ shipped: { ...app, actions: { ...app.actions, [generatedId.id]: generatedId } }, grants: scopeGrants([]), shells: [SHELL] });
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(shipping).toThrow('"generated.by-the-app" begins with "generated.", which is where what somebody generated is kept');
    } finally {
      said.mockRestore();
    }
    const { running } = world();
    expect(() => running.replace('extras', { [generatedId.id]: generatedId })).toThrow('"generated.by-the-app" begins with "generated.", which is where what somebody generated is kept');
    expect(Object.keys(running.actions())).toEqual(['home', 'desk']);
  });
});

describe('an action and a fragment a shell ships', () => {
  it('an action is not under the id of a fragment a shell ships: not at a boot, and not in a set handed over', () => {
    const sheetAction: ActionDefinition = { id: 'sheet', layout: saying('an action under the fragment’s id') };
    const shipping = (): unknown => createRunningManifest({ shipped: { ...app, actions: { ...app.actions, sheet: sheetAction } }, grants: scopeGrants([]), shells: [SHELL] });
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(shipping).toThrow('"sheet" is the id of an action and of a fragment a shell ships: an id names one of the two');
      const onAPage = { ...app, shell: { canvases: SHELL.canvases }, pages: { docs: { ...SHELL, path: '/docs' } }, actions: { ...app.actions, sheet: sheetAction } };
      expect(() => createRunningManifest({ shipped: onAPage, grants: scopeGrants([]), shells: [SHELL] })).toThrow('"sheet" is the id of an action and of a fragment a shell ships');
    } finally {
      said.mockRestore();
    }

    const { running } = world();
    expect(() => running.replace('extras', { sheet: sheetAction })).toThrow('"sheet" is the id of an action and of a fragment a shell ships: an id names one of the two');
    expect(() => running.replace('extras', { listedOtherwise: sheetAction })).toThrow('"sheet" is the id of an action and of a fragment a shell ships');
    expect(Object.keys(running.actions())).toEqual(['home', 'desk']);
  });
});
