import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Data } from '../src/data';
import type { NiscApp } from '../src/manifest';
import { buildRunningManifest } from '../src/server/server';

type Held = Parameters<Data['entriesHeldBy']>[0];

const open: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const close: SeedMutation = { fingerprint: 'deals/close', mutation: { op: 'update', table: 'deals', set: { open: false }, where: { eq: ['deals.id', { $context: 'id' }] } } };
const unbounded: SeedMutation = { fingerprint: 'deals/clear', mutation: { op: 'delete', table: 'deals', where: { eq: ['deals.open', false] } } };

const appWith = (more: Partial<NiscApp> = {}): NiscApp => ({ charter: { public: ['home'] }, actions: { home: { id: 'home' } }, entries: [open, close], ...more });

const dataDouble = (): { data: Pick<Data, 'grants' | 'dropOnChange' | 'pointer' | 'entriesHeldBy'>; asked: Held[] } => {
  const asked: Held[] = [];
  return {
    asked,
    data: {
      grants: scopeGrants(['deals']),
      dropOnChange: () => undefined,
      pointer: { read: async () => 0, move: async () => true },
      entriesHeldBy: (held) => {
        asked.push(held);
      },
    },
  };
};

describe('the running manifest, as the server stands it up', () => {
  it('is what the data module asks for an entry: it answers the ones the app shipped, compiled', async () => {
    const { data, asked } = dataDouble();
    const running = await buildRunningManifest(appWith(), {}, data);
    expect(asked).toHaveLength(1);
    expect((await asked[0]?.entries())?.map((row) => row.key)).toEqual(['deals/open', 'deals/close']);
    expect(await asked[0]?.get('deals/open')).toMatchObject({ kind: 'ok', protected: true, dsl: open.dsl });
    expect(await asked[0]?.get('deals/open')).toBe(await running.cacheEntry('deals/open'));
  });

  it('follows a set of entries handed over afterwards', async () => {
    const { data, asked } = dataDouble();
    const running = await buildRunningManifest(appWith(), {}, data);
    await running.replaceEntries('bundles', [{ ...open, fingerprint: 'ext/open' }]);
    expect((await asked[0]?.entries())?.map((row) => row.key)).toEqual(['deals/open', 'deals/close', 'ext/open']);
  });

  it('an app that ships no entry answers none', async () => {
    const { data, asked } = dataDouble();
    await buildRunningManifest(appWith({ entries: undefined }), {}, data);
    expect(await asked[0]?.entries()).toEqual([]);
  });

  it('an entry vex cannot run refuses the boot', async () => {
    const { data } = dataDouble();
    await expect(buildRunningManifest(appWith({ entries: [open, unbounded] }), {}, data)).rejects.toThrow(/Mutation seed "deals\/clear" fails the authoring lint/);
  });

  it('a manifest that is refused is asked nothing', async () => {
    const { data, asked } = dataDouble();
    const incoherent = appWith({ actions: { home: { id: 'home' }, 'home.sub': { id: 'home.sub' } } });
    await expect((async () => buildRunningManifest(incoherent, {}, data))()).rejects.toThrow(/^Charter is incoherent — refusing to serve:/);
    expect(asked).toEqual([]);
  });
});
