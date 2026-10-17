import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { CacheEntry, Query, SeedEntry } from '@niscorp/vex';
import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import { compile } from '@niscorp/prism';
import { createRunningManifest } from '../src/artifactory';
import type { RunningManifest } from '../src/artifactory';
import type { ShellManifest, ShippedManifest } from '../src/manifest';
import { nobody, rowsDouble } from './saved-double';
import type { RowsDouble } from './saved-double';

const saying = (text: string): LayoutNode => ({ component: 'Text', children: text });
const home: ActionDefinition = { id: 'home', layout: saying('home, as shipped') };
const sheet: ActionFragment = { kind: 'fragment', id: 'sheet', layout: { component: 'Sheet', children: [{ slot: 'body' }] } };
const openDeals: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const SHELL: ShellManifest = { canvases: [{ id: 'main', initial: 'home' }], fragments: { sheet }, components: { Sheet: {} } };
const app: ShippedManifest = {
  charter: {
    public: { actions: ['home', 'promo'], functions: ['deals.export'] },
    member: { actions: ['home', 'promo'], functions: ['deals.export'] },
    publisher: { extends: ['member'], functions: ['deals.*'] },
  },
  actions: { home },
  entries: [openDeals],
  shell: SHELL,
};

const named: Query = { from: ['deals'], fields: ['deals.id', 'deals.title'] };
const writtenFor = async (dsl: Query): Promise<CacheEntry> => {
  const mapping = { $ref: '$.result' };
  return { kind: 'ok', dsl, prismIr: await compile(mapping), mapping, shape: [{ id: 0 }], intent: 'the deals', requestHash: 'h_1', createdAt: 1 };
};

const world = async (shipped: ShippedManifest = app, rows: RowsDouble = rowsDouble()) => {
  const vexTable = new Map<string, CacheEntry>([['fp_written', await writtenFor(named)]]);
  const running: RunningManifest = createRunningManifest({
    shipped,
    grants: scopeGrants(['deals']),
    shells: [SHELL],
    published: () => rows.as('*').inForce(),
    reads: { written: async (fingerprint) => vexTable.get(fingerprint), compile: () => undefined, savedOf: (scope) => rows.as(String(scope['userId'])) },
  });
  const publishedBy = (roles: readonly string[]) => running.publishedArtifacts(rows.as('*'), async () => ({ roles, replayable: async () => ['deals/open'] }));
  const shellFor = (roles: readonly string[], principal: string | null = null) =>
    running.artifactsFor(SHELL, principal === null ? nobody(roles) : { principal, roles, installed: undefined, saved: rows.as(principal), replayable: async () => ['deals/open'] });
  return { running, rows, publishedBy, shellFor };
};

const calling = (fn: string): { layout: LayoutNode; endpoints: ActionDefinition['endpoints'] } => ({ layout: saying('the promo'), endpoints: { run: { fn } } });

describe('what is published for everybody: every kind a person saves', () => {
  it('a published action is given its id by whoever publishes it, is everybody’s, and wins over the build’s copy and a set handed over under that id until it is reset', async () => {
    const { running, publishedBy, shellFor } = await world();
    running.replace('bundles', { promo: { id: 'promo', layout: saying('the promo, from a set') } });
    await publishedBy(['publisher']).save([
      { kind: 'action', id: 'home', body: { layout: saying('home, as published') } },
      { kind: 'action', id: 'promo', body: { layout: saying('the promo') } },
    ]);
    await running.readPublished();

    expect(running.actions()['home']?.layout).toEqual(saying('home, as published'));
    expect(running.actions()['promo']?.layout).toEqual(saying('the promo'));
    const everybody = await shellFor(['public']);
    expect(Object.keys(everybody.actions).sort()).toEqual(['home', 'promo']);
    expect(everybody.layoutStore['action/home']).toEqual(saying('home, as published'));
    expect((await shellFor(['member'], 'ada')).layoutStore['action/promo']).toEqual(saying('the promo'));

    await publishedBy(['publisher']).reset('action', 'home');
    await publishedBy(['publisher']).reset('action', 'promo');
    await running.readPublished();
    expect(running.actions()['home']?.layout).toEqual(saying('home, as shipped'));
    expect(running.actions()['promo']?.layout).toEqual(saying('the promo, from a set'));
  });

  it('a publish names its action or fragment: one without an id is refused, and so is one under a generated id', async () => {
    const { publishedBy } = await world();
    await expect(publishedBy(['publisher']).save([{ kind: 'action', body: { layout: saying('x') } }])).rejects.toThrow(
      'moss: a published action is given its id by whoever publishes it: name it.',
    );
    await expect(publishedBy(['publisher']).save([{ kind: 'fragment', body: { layout: saying('x') } }])).rejects.toThrow(
      'moss: a published fragment is given its id by whoever publishes it: name it.',
    );
    await expect(publishedBy(['publisher']).save([{ kind: 'action', id: 'generated.promo', body: { layout: saying('x') } }])).rejects.toThrow(
      'Publish refused — actions nova does not read:\n  "generated.promo" begins with "generated.", which is where what somebody generated is kept',
    );
  });

  it('a published action is held as a generated one is, as the publisher; and it is held as a default is, to every holder’s grants', async () => {
    const { running, publishedBy } = await world();
    await expect(publishedBy(['member']).save([{ kind: 'action', id: 'promo', body: calling('deals.close') }])).rejects.toThrow(
      'endpoint "run" calls the function "deals.close", which its owner’s roles do not grant',
    );
    await expect(publishedBy(['publisher']).save([{ kind: 'action', id: 'promo', body: calling('deals.close') }])).rejects.toThrow(
      'Publish refused — actions call functions the app does not have, or that their holders’ charter does not grant:\n  "public" hold "promo", which calls "deals.close": their functions do not grant it',
    );

    await publishedBy(['publisher']).save([{ kind: 'action', id: 'promo', body: calling('deals.export') }]);
    await running.readPublished();
    expect(running.actions()['promo']?.endpoints).toEqual({ run: { fn: 'deals.export' } });
  });

  it('a published fragment reaches every shell, over the build’s one under that id', async () => {
    const { publishedBy, shellFor } = await world();
    await publishedBy(['publisher']).save([{ kind: 'fragment', id: 'sheet', body: { layout: { component: 'Sheet', children: [{ slot: 'body' }, saying('as published')] } } }]);

    expect(JSON.stringify((await shellFor(['public'])).fragments?.['sheet'])).toContain('as published');
    expect(JSON.stringify((await shellFor(['member'], 'ada')).fragments?.['sheet'])).toContain('as published');
  });

  it('a published read is answered to a signed-in caller after their own, and to nobody; one under a shipped fingerprint is refused', async () => {
    const { running, publishedBy } = await world();
    await expect(publishedBy(['publisher']).save([{ kind: 'read', id: 'deals/open', body: undefined }])).rejects.toThrow(
      '"deals/open" is the fingerprint of an entry the app ships or was handed, and a read somebody generated never answers in its place',
    );
    expect(await running.cacheEntry('fp_written', { userId: 'ada' })).toBeUndefined();

    await publishedBy(['publisher']).save([{ kind: 'read', id: 'fp_written', body: undefined }]);

    expect((await running.cacheEntry('fp_written', { userId: 'ada' }))?.kind).toBe('ok');
    expect((await running.cacheEntry('fp_written', { userId: 'anonymous' }))?.kind).toBe('ok');
    expect(await running.cacheEntry('fp_written')).toBeUndefined();
  });

  it('a generated action of a person may replay a published read', async () => {
    const { running, rows, publishedBy } = await world();
    await publishedBy(['publisher']).save([{ kind: 'read', id: 'fp_written', body: undefined }]);
    const ada = running.sessionArtifacts('ada', async () => ({ roles: ['member'], installed: undefined, saved: rows.as('ada'), replayable: async () => ['deals/open'] }));
    const replaying = { data: { rows: [] }, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'fp_written' }, target: 'rows' } }, layout: saying('the deals') };

    await expect(ada.save([{ kind: 'action', body: replaying }])).resolves.toBeDefined();
  });

  it('a published default whose function the next build dropped is left out once the functions are known, and the boot is not refused', async () => {
    const first = await world();
    await first.publishedBy(['publisher']).save([{ kind: 'action', id: 'promo', body: calling('deals.export') }]);
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const next = await world(app, first.rows);
      await next.running.readPublished();
      expect(next.running.actions()['promo']).toBeDefined();

      expect(() => next.running.functionsWritten([{ id: 'deals.close', description: 'Closes a deal.', execute: async () => undefined }])).not.toThrow();
      expect(next.running.actions()['promo']).toBeUndefined();
      await next.shellFor(['public']);

      expect(next.running.actions()['promo']).toBeUndefined();
      expect(said.mock.calls.map((call) => call[0])).toEqual([
        '[moss] what is published for everybody is left out, and the build’s copies stand: Actions call functions the app does not have, or that their holders’ charter does not grant — refusing to serve:\n  "promo" calls "deals.export", which the app has no function of',
      ]);
    } finally {
      said.mockRestore();
      warned.mockRestore();
    }
  });

  it('a published fragment is laid into the shells that can draw it, and left out of one that cannot, with a line', async () => {
    const { running, publishedBy, shellFor } = await world();
    await publishedBy(['publisher']).save([{ kind: 'fragment', id: 'banner', body: { layout: { component: 'Sheet', children: [{ slot: 'body' }] } } }]);
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(Object.keys((await shellFor(['public'])).fragments ?? {})).toContain('banner');
      const bare: ShellManifest = { canvases: [{ id: 'main', initial: 'home' }] };
      expect(Object.keys((await running.artifactsFor(bare, nobody(['public']))).fragments ?? {})).not.toContain('banner');
      expect(said.mock.calls.map((call) => call[0])).toEqual(['[moss] the fragment "banner" published for everybody is left out of a shell that cannot draw it: layout uses "Sheet", which this app has no component for']);
    } finally {
      said.mockRestore();
    }
  });

  it('a published default that no longer passes under a new build is left out, with a line, and the build’s copies stand', async () => {
    const first = await world();
    await first.publishedBy(['publisher']).save([{ kind: 'action', id: 'promo', body: calling('deals.export') }]);

    const ungranted: ShippedManifest = { ...app, charter: { ...app.charter, public: { actions: ['home', 'promo'] } } };
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const next = await world(ungranted, first.rows);
      await next.running.readPublished();

      expect(next.running.actions()['promo']).toBeUndefined();
      expect(next.running.actions()['home']).toEqual(home);
      expect(said.mock.calls.map((call) => call[0])).toEqual([
        '[moss] what is published for everybody is left out, and the build’s copies stand: Actions call functions the app does not have, or that their holders’ charter does not grant — refusing to serve:\n  "public" hold "promo", which calls "deals.export": their functions do not grant it',
      ]);
    } finally {
      said.mockRestore();
    }
  });
});
