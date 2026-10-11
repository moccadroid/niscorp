import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Data } from '../src/data';
import type { NiscApp } from '../src/manifest';
import { buildRunningManifest } from '../src/server/server';

// THE RUNNING MANIFEST AS THE SERVER STANDS IT UP (../src/server/manifest.ts),
// with no server and no database: the data module is a stand-in that records
// what it is handed.
//
// THE ENTRIES HAVE ONE HOLDER WHILE A SERVER RUNS: the running manifest, and
// what is seeded where vex replays from is what it hands over.

type Entry = SeedEntry | SeedMutation;

const open: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const close: SeedMutation = { fingerprint: 'deals/close', mutation: { op: 'update', table: 'deals', set: { open: false }, where: { eq: ['deals.id', { $context: 'id' }] } } };

const appWith = (more: Partial<NiscApp> = {}): NiscApp => ({ charter: { public: ['home'] }, actions: { home: { id: 'home' } }, entries: [open, close], ...more });

// What `buildRunningManifest` asks of the data module, recording what it was handed
// to seed.
const dataDouble = (): { data: Pick<Data, 'grants' | 'dropOnChange' | 'pointer' | 'seed'>; seeded: (readonly Entry[])[] } => {
  const seeded: (readonly Entry[])[] = [];
  return {
    seeded,
    data: {
      grants: scopeGrants(['deals']),
      dropOnChange: () => undefined,
      pointer: { read: async () => 0, move: async () => true },
      seed: async (entries) => {
        seeded.push(entries);
      },
    },
  };
};

describe('the running manifest, as the server stands it up', () => {
  it('hands the data module the entries it holds, to seed where vex replays from', async () => {
    const { data, seeded } = dataDouble();
    const running = await buildRunningManifest(appWith(), {}, data);
    expect(seeded).toEqual([[open, close]]);
    // The list itself, and not another reading of the app.
    expect(seeded[0]).toBe(running.entries());
  });

  it('an app that ships no entry hands over none', async () => {
    const { data, seeded } = dataDouble();
    await buildRunningManifest(appWith({ entries: undefined }), {}, data);
    expect(seeded).toEqual([[]]);
  });

  it('a manifest that is refused seeds nothing', async () => {
    const { data, seeded } = dataDouble();
    // An id that is a namespace of another is something the charter refuses.
    const incoherent = appWith({ actions: { home: { id: 'home' }, 'home.sub': { id: 'home.sub' } } });
    await expect((async () => buildRunningManifest(incoherent, {}, data))()).rejects.toThrow(/^Charter is incoherent — refusing to serve:/);
    expect(seeded).toEqual([]);
  });
});
