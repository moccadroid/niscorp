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

// What an app shipped, as a server hands it over: the seven fields a
// verification reads. A fresh record each time, so no case reads another's.
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

  it('with no filter every granted action is there; one said later narrows what is answered next', () => {
    const manifest = createRunningManifest({ shipped: shippedApp(), grants: scopeGrants(['deals']) });
    manifest.replace('bundles', { [desk.id]: desk, [pay.id]: pay });
    const everything = manifest.catalogFor(['member'], ['belts']);
    expect(everything.ids).toEqual([desk.id, pay.id, 'home', 'panel']);

    manifest.narrowCatalogs(installedOnly);

    // What was remembered was made without the filter, so it is not kept.
    expect(manifest.catalogFor(['member'], ['belts'])).not.toBe(everything);
    expect(manifest.catalogFor(['member'], ['belts']).ids).toEqual([desk.id, 'home', 'panel']);
    expect(manifest.catalogFor(['member'], undefined).ids).toEqual([desk.id, pay.id, 'home', 'panel']);
    // A second rule is applied to what the first kept.
    manifest.narrowCatalogs((ids) => ids.filter((id) => id !== 'panel'));
    expect(manifest.catalogFor(['member'], ['belts']).ids).toEqual([desk.id, 'home']);
  });
});

describe('what the app shipped, and a set that was taken', () => {
  it('the record the app shipped is read and never written', () => {
    const shipped = shippedApp();
    const handedOver = shipped.actions;
    const manifest = running(shipped);

    manifest.replace('bundles', { [desk.id]: desk });
    manifest.refresh();

    // What arrived is in force, and is not in the app's record: nothing writes
    // the actions in force back into it.
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id]);
    expect(shipped.actions).toBe(handedOver);
    expect(Object.keys(shipped.actions)).toEqual(['home', 'panel']);
  });

  it('refresh ships nothing: it verifies what is in force again, drops what was derived and tells whoever listens', () => {
    const manifest = running(shippedApp());
    manifest.replace('bundles', { [desk.id]: desk });
    const told = vi.fn();
    manifest.onChange(told);
    const inForce = Object.keys(manifest.actions());
    const held = manifest.catalogFor(['member'], undefined);
    const verifiedBy = manifest.report();

    manifest.refresh();

    expect(Object.keys(manifest.actions())).toEqual(inForce);
    expect(manifest.catalogFor(['member'], undefined)).not.toBe(held);
    expect(manifest.catalogFor(['member'], undefined)).toEqual(held);
    expect(manifest.report()).not.toBe(verifiedBy);
    expect(manifest.report().errors).toEqual([]);
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('a set that is taken is frozen where it stands: it is replaced, not edited', () => {
    const manifest = running(shippedApp());
    const editable: ActionDefinition = { id: desk.id, title: 'Desk', data: { open: false } };
    const set: Record<string, ActionDefinition> = { [desk.id]: editable };

    manifest.replace('bundles', set);

    // Every way of editing what was handed over throws, where it is written.
    expect(() => {
      set[grades.id] = grades;
    }).toThrow(TypeError);
    expect(() => {
      delete set[desk.id];
    }).toThrow(TypeError);
    expect(() => {
      editable.title = 'Front desk';
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(editable.data ?? {}, { open: true });
    }).toThrow(TypeError);
    expect(manifest.actions()[desk.id]).toEqual({ id: desk.id, title: 'Desk', data: { open: false } });

    // The one way: hand over another.
    manifest.replace('bundles', { [desk.id]: { ...editable, title: 'Front desk' } });
    expect(manifest.actions()[desk.id]?.title).toBe('Front desk');
  });

  it('a set that is refused, or only tried, is left as the caller wrote it', () => {
    const manifest = running(shippedApp());
    const refused: Record<string, ActionDefinition> = { 'home.sub': { id: 'home.sub' } };
    const tried: Record<string, ActionDefinition> = { [desk.id]: { id: desk.id } };

    expect(() => manifest.replace('bundles', refused)).toThrow(/^Refresh refused/);
    manifest.verifyReplace('bundles', tried);

    expect(Object.isFrozen(refused)).toBe(false);
    expect(Object.isFrozen(tried)).toBe(false);
    expect(Object.isFrozen(tried[desk.id])).toBe(false);
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
      expect(Object.keys(shipped.actions)).toEqual(['home', 'panel']);
      expect(told).toHaveBeenCalledTimes(1);
      expect(moves()).toBe(0);

      // ...and a quiet interval is not a move.
      await aMoment();
      expect(told).toHaveBeenCalledTimes(1);
    } finally {
      manifest.stop();
    }
  });

  it('a set named after the manifest stands is read again the same way, and has its place from when it was named', async () => {
    const { pool, poke, moves } = pointerPool();
    const rows: { now: Record<string, ActionDefinition> } = { now: { [desk.id]: desk } };
    const manifest = running(shippedApp(), { pointer: { pool, everyMs: 1 } });
    try {
      const told = vi.fn();
      manifest.onChange(told);
      manifest.loadFrom('integrations', async () => rows.now);
      // Naming it switched nothing: it is empty until it is replaced.
      expect(Object.keys(manifest.actions())).toEqual(['home', 'panel']);
      expect(told).not.toHaveBeenCalled();

      manifest.replace('bundles', { [pay.id]: pay });
      manifest.replace('integrations', rows.now);
      manifest.watch();
      await aMoment();

      rows.now = { [desk.id]: desk, [grades.id]: grades };
      poke();
      await aMoment();

      // Before `bundles`, which was replaced first and named second.
      expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id, grades.id, pay.id]);
      expect(told).toHaveBeenCalledTimes(3);
      expect(moves()).toBe(0);
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
