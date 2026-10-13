import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { createRunningManifest } from '../src/artifactory';
import type { RunningManifest } from '../src/artifactory';
import type { Pointer } from '../src/artifactory/generation';
import type { RunningManifestConfig } from '../src/artifactory/running';
import type { ShellManifest } from '../src/manifest';
import type { ShippedManifest } from '../src/manifest/verify';
import { nobody } from './saved-double';

type Entry = SeedEntry | SeedMutation;

const open: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const close: SeedMutation = { fingerprint: 'deals/close', mutation: { op: 'update', table: 'deals', set: { open: false }, where: { eq: ['deals.id', { $context: 'id' }] } } };
const won: SeedEntry = { fingerprint: 'ext/won', dsl: { from: ['deals'], fields: ['deals.id', 'deals.title'] } };
const lost: SeedEntry = { fingerprint: 'ext/lost', dsl: { from: ['deals'], fields: ['deals.id'] } };
const unbounded: SeedMutation = { fingerprint: 'ext/clear', mutation: { op: 'delete', table: 'deals', where: { eq: ['deals.open', false] } } };
const unread = { fingerprint: 'ext/unread', dsl: { from: 'deals' } } as unknown as SeedEntry;
const unnamed = { dsl: lost.dsl } as unknown as SeedEntry;
const misspelt = { ...lost, mappping: { $ref: '$.result' } } as unknown as SeedEntry;

const shipping = (...entries: Entry[]): ShippedManifest => ({ charter: { public: ['home'] }, actions: { home: { id: 'home' } }, entries });

const running = (shipped: ShippedManifest = shipping(open, close), more: Partial<RunningManifestConfig> = {}): RunningManifest =>
  createRunningManifest({ shipped, grants: scopeGrants(['deals']), shells: [], ...more });

const SHELL: ShellManifest = { canvases: [] };
const held = async (manifest: RunningManifest): Promise<string[]> => (await manifest.cacheEntries()).map((row) => row.key).sort();

describe('the entries in force — what the app shipped', () => {
  it('each is answered as vex replays it: compiled, protected, and born of no request', async () => {
    const manifest = running();
    const read = await manifest.cacheEntry('deals/open');
    expect(read).toMatchObject({ kind: 'ok', protected: true, dsl: open.dsl });
    expect(read?.kind === 'ok' ? read.prismIr?.irVersion : undefined).toBe(1);
    expect(read?.requestHash).toBeUndefined();
    expect(await manifest.cacheEntry('deals/close')).toMatchObject({ kind: 'mutation', protected: true, mutation: close.mutation });
    expect(await manifest.cacheEntry('deals/closed')).toBeUndefined();
    expect(await held(manifest)).toEqual(['deals/close', 'deals/open']);
  });

  it('a write that fails the authoring lint refuses whoever asks first, in vex’s words', async () => {
    const manifest = running(shipping(open, unbounded));
    await expect(manifest.cacheEntries()).rejects.toThrow(/Mutation seed "ext\/clear" fails the authoring lint/);
    await expect(manifest.cacheEntry('deals/open')).rejects.toThrow(/Mutation seed "ext\/clear" fails the authoring lint/);
  });
});

describe('replaceEntries — a named set of entries that arrived while the app runs', () => {
  it('is answered beside what the app shipped, and a shell is told of it', async () => {
    const manifest = running();
    await manifest.replaceEntries('bundles', [won, lost]);
    expect(await held(manifest)).toEqual(['deals/close', 'deals/open', 'ext/lost', 'ext/won']);
    expect(await manifest.cacheEntry('ext/won')).toMatchObject({ kind: 'ok', protected: true, dsl: won.dsl });
    expect(manifest.entries().map((entry) => entry.fingerprint)).toEqual(['deals/open', 'deals/close', 'ext/won', 'ext/lost']);
    expect((await manifest.artifactsFor(SHELL, nobody(['public']))).entries.get('ext/won')).toBe(won);
  });

  it('replaces the set of its name whole: an entry it no longer holds is gone', async () => {
    const manifest = running();
    await manifest.replaceEntries('bundles', [won, lost]);
    await manifest.replaceEntries('payments', [{ ...won, fingerprint: 'pay/won' }]);
    await manifest.replaceEntries('bundles', [lost]);
    expect(await held(manifest)).toEqual(['deals/close', 'deals/open', 'ext/lost', 'pay/won']);
    expect(await manifest.cacheEntry('ext/won')).toBeUndefined();
    expect((await manifest.artifactsFor(SHELL, nobody(['public']))).entries.has('ext/won')).toBe(false);
  });

  it('an entry of a set is answered in place of the one the app shipped under that fingerprint, for as long as the set holds it', async () => {
    const manifest = running();
    const wider: SeedEntry = { ...open, dsl: { from: ['deals'], fields: ['deals.id', 'deals.title'] } };
    await manifest.replaceEntries('bundles', [wider]);
    expect(await manifest.cacheEntry('deals/open')).toMatchObject({ dsl: wider.dsl });
    expect(manifest.entries()).toHaveLength(2);
    await manifest.replaceEntries('bundles', []);
    expect(await manifest.cacheEntry('deals/open')).toMatchObject({ dsl: open.dsl });
  });

  it('of two sets that hold one fingerprint, the one handed over under the later name is answered', async () => {
    const manifest = running();
    const narrow: SeedEntry = { ...won, dsl: { from: ['deals'], fields: ['deals.id'] } };
    await manifest.replaceEntries('bundles', [won]);
    await manifest.replaceEntries('payments', [narrow]);
    expect(await manifest.cacheEntry('ext/won')).toMatchObject({ dsl: narrow.dsl });
    expect((await manifest.artifactsFor(SHELL, nobody(['public']))).entries.get('ext/won')).toBe(narrow);
    await manifest.replaceEntries('bundles', [won]);
    expect(await manifest.cacheEntry('ext/won')).toMatchObject({ dsl: narrow.dsl });
  });

  it('of two sets handed over under one name at once, the later is the one in force, however long the earlier takes', async () => {
    const manifest = running();
    const many = Array.from({ length: 60 }, (_unused, index): SeedEntry => ({ ...won, fingerprint: `ext/many-${index}`, mapping: { id: { $ref: '$.result' } } }));
    const earlier = manifest.replaceEntries('bundles', many);
    const later = manifest.replaceEntries('bundles', [lost]);
    await Promise.all([earlier, later]);
    expect(await held(manifest)).toEqual(['deals/close', 'deals/open', 'ext/lost']);
  });

  it('a set that is refused does not hold up the one handed over after it', async () => {
    const manifest = running();
    const refused = manifest.replaceEntries('bundles', [unbounded]);
    const taken = manifest.replaceEntries('bundles', [won]);
    await expect(refused).rejects.toThrow(/authoring lint/);
    await taken;
    expect(await held(manifest)).toEqual(['deals/close', 'deals/open', 'ext/won']);
  });

  it('accepted: whoever listens is told once, the set is frozen where it stands, and the report is the one it was verified by', async () => {
    const manifest = running();
    const told = vi.fn();
    manifest.onChange(told);
    const verifiedBy = manifest.report();
    const set = [won];
    await manifest.replaceEntries('bundles', set);
    expect(told).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(won.dsl)).toBe(true);
    expect(manifest.report()).not.toBe(verifiedBy);
    expect(manifest.report().errors).toEqual([]);
  });

  it.each([
    ['a write that fails the authoring lint', [lost, unbounded], /Mutation seed "ext\/clear" fails the authoring lint/],
    ['an entry vex does not read', [lost, unread], /^Refresh refused — entries that do not parse:\n {2}entries\.1\.dsl\.from: /],
    ['an entry with no fingerprint', [lost, unnamed], /^Refresh refused — entries that do not parse:\n {2}entries\.1\.fingerprint: /],
    ['an entry with a key no entry has', [misspelt], /^Refresh refused — entries that do not parse:\n {2}entries\.0: Unrecognized key: "mappping"/],
    ['a reach no table offers', [lost, { ...won, reach: 'nowhere' }], /^Refresh refused — entries declare a reach no table offers:\n {2}ext\/won declares reach "nowhere"/],
  ])('refused for %s: nothing of the set is taken, and nobody is told', async (_why, set, refusal) => {
    const manifest = running();
    await manifest.replaceEntries('bundles', [won]);
    const told = vi.fn();
    manifest.onChange(told);
    const before = manifest.entries();
    const verifiedBy = manifest.report();

    await expect(manifest.replaceEntries('bundles', set)).rejects.toThrow(refusal);

    expect(manifest.entries()).toBe(before);
    expect(manifest.report()).toBe(verifiedBy);
    expect(await held(manifest)).toEqual(['deals/close', 'deals/open', 'ext/won']);
    expect(told).not.toHaveBeenCalled();
  });

  it('a name a feature claimed is not the app’s to hand entries over under, and a name the app used cannot be claimed', async () => {
    const manifest = running();
    manifest.claim('integrations', 'the feature "integrations"');
    await expect(manifest.replaceEntries('integrations', [won])).rejects.toThrow(/^moss: the set "integrations" is the feature "integrations"'s/);
    await manifest.replaceEntries('bundles', [won]);
    expect(() => manifest.claim('bundles', 'the feature "bundles"')).toThrow(/was handed over by the app/);
  });
});

describe('replaceEntries — the pointer the other processes poll', () => {
  const EVERY_MS = 1_000;
  const aMoment = (): Promise<unknown> => vi.advanceTimersByTimeAsync(EVERY_MS);
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a set that is taken moves it once, and one that is refused does not', async () => {
    const state = { n: 0, moves: 0 };
    const pointer: Pointer = {
      read: async () => state.n,
      move: async (from) => {
        if (state.n !== from) return false;
        state.n += 1;
        state.moves += 1;
        return true;
      },
    };
    const manifest = running(shipping(open), { pointer: { ...pointer, everyMs: EVERY_MS } });
    try {
      manifest.watch();
      await aMoment();
      await manifest.replaceEntries('bundles', [won]);
      await aMoment();
      expect(state.moves).toBe(1);

      await expect(manifest.replaceEntries('bundles', [unbounded])).rejects.toThrow(/authoring lint/);
      await aMoment();
      expect(state.moves).toBe(1);
    } finally {
      manifest.stop();
    }
  });
});
