import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import type { ActionDefinition } from '@niscorp/nova';
import { createRunningManifest } from '../src/manifest';
import type { RunningManifestConfig, ShippedManifest } from '../src/manifest';

// THE RUNNING MANIFEST: what the app consists of right now, changed in one
// place and only to something that may be served. Driven directly, with small
// hand-made definitions: no database and no server.

const home: ActionDefinition = { id: 'home' };
const panel: ActionDefinition = { id: 'panel' };
const desk: ActionDefinition = { id: 'ext.belts.desk' };
const grades: ActionDefinition = { id: 'ext.belts.grades' };
const pay: ActionDefinition = { id: 'ext.pay.checkout' };

// A fresh record each time: the manifest writes `actions` on it.
const shippedApp = (): ShippedManifest => ({
  charter: { public: ['home'], member: { actions: ['home', 'panel', 'ext.*'] } },
  assignments: { usr_1: ['member'] },
  actions: { home, panel },
  entries: [{ fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } }],
});

// The shape of the integrations' filter: an `ext.<owner>.<name>` action is
// there only where its owner is installed.
const installedOnly: RunningManifestConfig['installedOnly'] = (ids, installed) =>
  installed === undefined ? ids : ids.filter((id) => !id.startsWith('ext.') || installed.has(id.split('.')[1] ?? ''));

const running = (shipped: ShippedManifest, more: Partial<RunningManifestConfig> = {}): ReturnType<typeof createRunningManifest> =>
  createRunningManifest({ shipped, grants: scopeGrants(['deals']), installedOnly, ...more });

// An id that is a namespace of another is something the charter engine
// refuses, so a set that ships `home.sub` beside the app's `home` is a set the
// app could not be served with.
const unservable: Record<string, ActionDefinition> = { 'home.sub': { id: 'home.sub' } };

describe('createRunningManifest — creating it is the boot check', () => {
  it('refuses a manifest that may not be served, in the words of a boot', () => {
    const shipped: ShippedManifest = { ...shippedApp(), actions: { home, ...unservable } };
    expect(() => running(shipped)).toThrow(/^Charter is incoherent — refusing to serve:\n {2}leaves-only: id "home" is a namespace of "home.sub"/);
  });

  it('says a chain of steps that never ends, once, and serves', () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const loop: ActionDefinition = { id: 'panel', triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }] };
      const manifest = running({ ...shippedApp(), actions: { home, panel: loop } });
      expect(said.mock.calls).toEqual([['[moss] a chain of steps that never ends: x —emit (panel)→ x — nova stops it at its budget when it runs (RUNAWAY_CHAIN)']]);
      // A later switch still reports it, and does not print it again.
      manifest.replace('bundles', { [desk.id]: desk });
      expect(manifest.report().said).toHaveLength(1);
      expect(said).toHaveBeenCalledTimes(1);
    } finally {
      said.mockRestore();
    }
  });

  it('looks an entry up by its fingerprint', () => {
    const manifest = running(shippedApp());
    expect(manifest.entries.get('deals/open')?.fingerprint).toBe('deals/open');
    expect(manifest.entries.get('deals/closed')).toBeUndefined();
  });
});

describe('replace — a named set of actions that arrived while the app runs', () => {
  it('the actions in force are what the app shipped, then each named set', () => {
    const manifest = running(shippedApp());
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel']);

    manifest.replace('bundles', { [desk.id]: desk, [grades.id]: grades });
    manifest.replace('payments', { [pay.id]: pay });
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id, grades.id, pay.id]);

    // The same name again puts the new set in place of the old: an action it
    // no longer names leaves, and the other set is not touched.
    manifest.replace('bundles', { [grades.id]: grades });
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', grades.id, pay.id]);
  });

  it('accepted: what each set of roles held is dropped, and whoever listens is told once', () => {
    const manifest = running(shippedApp());
    const told = vi.fn();
    const stop = manifest.onChange(told);
    const before = manifest.catalogFor(['member'], undefined);
    const variantsBefore = manifest.variantsFor(['member']);
    const verifiedBy = manifest.report();
    // Held: the same question is answered with the same object.
    expect(manifest.catalogFor(['member'], undefined)).toBe(before);
    expect(manifest.variantsFor(['member'])).toBe(variantsBefore);
    expect(before.ids).toEqual(['home', 'panel']);

    manifest.replace('bundles', { [desk.id]: desk });

    expect(told).toHaveBeenCalledTimes(1);
    const after = manifest.catalogFor(['member'], undefined);
    expect(after).not.toBe(before);
    expect(after.ids).toEqual([desk.id, 'home', 'panel']);
    expect(after.hash).not.toBe(before.hash);
    expect(manifest.variantsFor(['member'])).not.toBe(variantsBefore);
    expect(manifest.report()).not.toBe(verifiedBy);

    // ...and somebody who stopped listening is not told again.
    stop();
    manifest.replace('bundles', {});
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('refused: the actions in force, what the roles held and whoever listens are untouched', () => {
    const shipped = shippedApp();
    const manifest = running(shipped);
    manifest.replace('bundles', { [desk.id]: desk });
    const told = vi.fn();
    manifest.onChange(told);
    const inForce = manifest.actions();
    const held = manifest.catalogFor(['member'], undefined);
    const variantsHeld = manifest.variantsFor(['member']);
    const verifiedBy = manifest.report();
    const appsRecord = shipped.actions;

    expect(() => manifest.replace('bundles', unservable)).toThrow(/^Refresh refused — charter incoherent over the new artifacts:\n {2}leaves-only: id "home" is a namespace of "home.sub"/);

    expect(manifest.actions()).toBe(inForce);
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id]);
    expect(manifest.catalogFor(['member'], undefined)).toBe(held);
    expect(manifest.variantsFor(['member'])).toBe(variantsHeld);
    expect(manifest.report()).toBe(verifiedBy);
    expect(told).not.toHaveBeenCalled();
    expect(shipped.actions).toBe(appsRecord);

    // The set it tried to replace is still the one in force, so the next
    // change is laid over what is served, not over what was refused.
    manifest.replace('payments', { [pay.id]: pay });
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id, pay.id]);
  });

  it('a listener that throws does not stop the others being told, nor undo the switch', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const manifest = running(shippedApp());
      const told = vi.fn();
      manifest.onChange(() => {
        throw new Error('a listener of the app’s');
      });
      manifest.onChange(told);
      manifest.replace('bundles', { [desk.id]: desk });
      expect(told).toHaveBeenCalledTimes(1);
      expect(Object.keys(manifest.actions())).toContain(desk.id);
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });

  it('verify tries a candidate and switches to nothing', () => {
    const manifest = running(shippedApp());
    const told = vi.fn();
    manifest.onChange(told);
    const inForce = manifest.actions();

    expect(manifest.verify({ ...manifest.actions(), ...unservable }).errors.map((error) => error.check)).toEqual(['charter']);
    expect(manifest.verify({ ...manifest.actions(), [desk.id]: desk }).errors).toEqual([]);

    expect(manifest.actions()).toBe(inForce);
    expect(told).not.toHaveBeenCalled();
  });
});

describe('verifyReplace — what `replace` would be told, with nothing switched', () => {
  it('says why a set would be refused, and that another would be taken, and changes nothing', () => {
    const manifest = running(shippedApp());
    manifest.replace('bundles', { [desk.id]: desk });
    const told = vi.fn();
    manifest.onChange(told);
    const inForce = manifest.actions();
    const held = manifest.catalogFor(['member'], undefined);
    const verifiedBy = manifest.report();

    const refused = manifest.verifyReplace('bundles', unservable);
    expect(refused.errors.map((error) => error.check)).toEqual(['charter']);
    expect(refused.errors[0]?.detail).toMatch(/^leaves-only: id "home" is a namespace of "home.sub"/);
    expect(manifest.verifyReplace('bundles', { [grades.id]: grades }).errors).toEqual([]);

    expect(manifest.actions()).toBe(inForce);
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id]);
    expect(manifest.catalogFor(['member'], undefined)).toBe(held);
    expect(manifest.report()).toBe(verifiedBy);
    expect(told).not.toHaveBeenCalled();
    // What it answered is what `replace` then does.
    expect(() => manifest.replace('bundles', unservable)).toThrow(/^Refresh refused/);
    expect(() => manifest.replace('bundles', { [grades.id]: grades })).not.toThrow();
  });

  it('tries the set IN PLACE of the one of that name: what the old set held is not part of the candidate', () => {
    // `panel` pushes an action only the set in force ships, so the set that
    // would replace it leaves a role pushing what it no longer holds.
    const opens: ActionDefinition = { id: 'panel', triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: desk.id } }] }] };
    const manifest = running({ ...shippedApp(), actions: { home, panel: opens } });
    manifest.replace('bundles', { [desk.id]: desk });
    const issuesOf = (report: ReturnType<typeof manifest.report>): string[] => report.charter.perRole.find((entry) => entry.role === 'member')?.issues ?? [];
    expect(issuesOf(manifest.report())).toEqual([]);

    expect(issuesOf(manifest.verifyReplace('bundles', { [grades.id]: grades })).join(' ')).toContain(desk.id);
    // Another name is another set: the one in force stays in the candidate.
    expect(issuesOf(manifest.verifyReplace('payments', { [pay.id]: pay }))).toEqual([]);
  });
});

describe('what a set of roles holds', () => {
  it('is kept by roles and install list, through the filter it was handed', () => {
    const manifest = running(shippedApp());
    manifest.replace('bundles', { [desk.id]: desk, [pay.id]: pay });

    expect(manifest.catalogFor(['member'], undefined).ids).toEqual([desk.id, pay.id, 'home', 'panel']);
    expect(manifest.catalogFor(['member'], ['belts']).ids).toEqual([desk.id, 'home', 'panel']);
    expect(manifest.catalogFor(['member'], []).ids).toEqual(['home', 'panel']);
    expect(manifest.catalogFor(['public'], ['belts']).ids).toEqual(['home']);
    // One answer per combination, whoever asks and in whatever order they name it.
    expect(manifest.catalogFor(['member'], ['belts'])).toBe(manifest.catalogFor(['member'], ['belts']));
    expect(manifest.catalogFor(['member', 'public'], undefined)).toBe(manifest.catalogFor(['public', 'member'], undefined));
  });
});

describe('the app’s own record, while some code still reads it', () => {
  it('is kept equal to the actions in force, and left alone when it already is', () => {
    const shipped = shippedApp();
    const handedOver = shipped.actions;
    const manifest = running(shipped);

    // Nothing arrived: the record the app handed over is still its own.
    manifest.refresh();
    expect(shipped.actions).toBe(handedOver);

    manifest.replace('bundles', { [desk.id]: desk });
    expect(Object.keys(shipped.actions)).toEqual(['home', 'panel', desk.id]);
    // A copy: the app editing its record does not edit what is in force.
    expect(shipped.actions).not.toBe(manifest.actions());
  });

  it('refresh ships what the record holds now, and keeps what the sets put there', () => {
    const shipped = shippedApp();
    const manifest = running(shipped);
    manifest.replace('bundles', { [desk.id]: desk });
    const lobby: ActionDefinition = { id: 'lobby' };

    // Edited in place: one added, one taken out. Not in force until it is said.
    shipped.actions['lobby'] = lobby;
    delete shipped.actions['panel'];
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id]);
    manifest.refresh();
    expect(Object.keys(manifest.actions())).toEqual(['home', 'lobby', desk.id]);

    // Replaced whole, naming nothing of the set: the set's action is the
    // set's, and stays until the set is replaced.
    shipped.actions = { home };
    manifest.refresh();
    expect(Object.keys(manifest.actions())).toEqual(['home', desk.id]);
    manifest.replace('bundles', {});
    expect(Object.keys(manifest.actions())).toEqual(['home']);
  });

  it('a refresh that is refused leaves what was in force, and the report it was verified by', () => {
    const shipped = shippedApp();
    const manifest = running(shipped);
    const inForce = manifest.actions();
    const verifiedBy = manifest.report();

    // A deny that matches nothing is an error.
    shipped.charter = { ...shipped.charter, member: { allow: ['home', 'panel'], deny: ['hmoe'] } };
    expect(() => manifest.refresh()).toThrow(/^Refresh refused — charter incoherent over the new artifacts:\n {2}dead-deny/);

    expect(manifest.actions()).toBe(inForce);
    expect(manifest.report()).toBe(verifiedBy);
  });
});

describe('watch — the pointer the other processes poll', () => {
  // A pool of exactly the shape the pointer uses: one counter, moved by an
  // UPDATE here or by `poke`, which is what another process did.
  const pointerPool = (): { pool: PgPool; poke: () => void; moves: () => number } => {
    const state = { n: 0, moves: 0 };
    return {
      pool: {
        query: async (sql: string) => {
          if (!sql.startsWith('UPDATE')) return { rows: [{ n: state.n }] };
          state.n += 1;
          state.moves += 1;
          return { rows: [] };
        },
      },
      poke: () => void (state.n += 1),
      moves: () => state.moves,
    };
  };
  const aMoment = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

  it('before it watches a switch moves nothing; after, each switch moves the pointer once', async () => {
    const { pool, moves } = pointerPool();
    const manifest = running(shippedApp(), { pointer: { pool, everyMs: 1 } });
    try {
      manifest.replace('bundles', { [desk.id]: desk });
      await aMoment();
      expect(moves()).toBe(0);
      expect(manifest.generation()).toBe(-1);

      manifest.watch();
      await aMoment();
      expect(manifest.generation()).toBe(0);
      manifest.replace('bundles', {});
      await aMoment();
      expect(moves()).toBe(1);
      expect(manifest.generation()).toBe(1);

      // A change that is refused is not a change: nobody else is told either.
      expect(() => manifest.replace('bundles', unservable)).toThrow(/^Refresh refused/);
      await aMoment();
      expect(moves()).toBe(1);
    } finally {
      manifest.stop();
    }
  });

  it('a move another process made reads the sets that live in rows again, and moves nothing', async () => {
    const { pool, poke, moves } = pointerPool();
    const rows: { now: Record<string, ActionDefinition> } = { now: { [desk.id]: desk } };
    const shipped = shippedApp();
    const manifest = running(shipped, { loaders: { integrations: async () => rows.now }, pointer: { pool, everyMs: 1 } });
    try {
      manifest.replace('integrations', rows.now);
      manifest.replace('bundles', { [pay.id]: pay });
      manifest.watch();
      await aMoment();
      const told = vi.fn();
      manifest.onChange(told);

      // Another process approved one more and moved the pointer.
      rows.now = { [desk.id]: desk, [grades.id]: grades };
      poke();
      await aMoment();

      // The set with a loader was read again; the one without is as it was.
      // Its place is its own from the start, whichever change came first.
      expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id, grades.id, pay.id]);
      expect(Object.keys(shipped.actions)).toEqual(['home', 'panel', desk.id, grades.id, pay.id]);
      expect(told).toHaveBeenCalledTimes(1);
      expect(moves()).toBe(0);

      // ...and a quiet interval is not a move.
      await aMoment();
      expect(told).toHaveBeenCalledTimes(1);
    } finally {
      manifest.stop();
    }
  });

  it('stopping ends the watching', async () => {
    const { pool, poke } = pointerPool();
    const manifest = running(shippedApp(), { pointer: { pool, everyMs: 1 } });
    manifest.watch();
    await aMoment();
    const told = vi.fn();
    manifest.onChange(told);
    manifest.stop();
    poke();
    await aMoment();
    expect(told).not.toHaveBeenCalled();
  });
});
