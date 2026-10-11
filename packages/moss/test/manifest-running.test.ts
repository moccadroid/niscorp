import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition } from '@niscorp/nova';
import { createRunningManifest } from '../src/manifest';
import type { Pointer, RunningManifest, RunningManifestConfig, ShellManifest, ShippedManifest } from '../src/manifest';

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

// A shell that declares nothing, for the cases that are about what a set of
// roles holds: the definitions are asked for as a shell asks for them, through
// `artifactsFor`, which is the one way they are answered.
const SHELL: ShellManifest = { canvases: [] };
const definitionsOf = (manifest: RunningManifest, roles: readonly string[], installed?: readonly string[]): Readonly<Record<string, ActionDefinition>> =>
  manifest.artifactsFor(SHELL, roles, installed).actions;

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

  it('holds the entries the app serves: the list as it shipped them, and each by its fingerprint for a shell', () => {
    const shipped = shippedApp();
    const manifest = running(shipped);
    expect(manifest.entries()).toEqual(shipped.entries);
    const byFingerprint = manifest.artifactsFor(SHELL, ['public'], undefined).entries;
    expect(byFingerprint.get('deals/open')?.fingerprint).toBe('deals/open');
    expect(byFingerprint.get('deals/closed')).toBeUndefined();
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
    const definitionsBefore = definitionsOf(manifest, ['member']);
    const verifiedBy = manifest.report();
    // Held: the same question is answered with the same object.
    expect(manifest.catalogFor(['member'], undefined)).toBe(before);
    expect(definitionsOf(manifest, ['member'])).toBe(definitionsBefore);
    expect(before.ids).toEqual(['home', 'panel']);

    manifest.replace('bundles', { [desk.id]: desk });

    expect(told).toHaveBeenCalledTimes(1);
    const after = manifest.catalogFor(['member'], undefined);
    expect(after).not.toBe(before);
    expect(after.ids).toEqual([desk.id, 'home', 'panel']);
    expect(after.hash).not.toBe(before.hash);
    expect(definitionsOf(manifest, ['member'])).not.toBe(definitionsBefore);
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
    const definitionsHeld = definitionsOf(manifest, ['member']);
    const verifiedBy = manifest.report();
    const appsRecord = shipped.actions;

    expect(() => manifest.replace('bundles', unservable)).toThrow(/^Refresh refused — charter incoherent over the new artifacts:\n {2}leaves-only: id "home" is a namespace of "home.sub"/);

    expect(manifest.actions()).toBe(inForce);
    expect(Object.keys(manifest.actions())).toEqual(['home', 'panel', desk.id]);
    expect(manifest.catalogFor(['member'], undefined)).toBe(held);
    expect(definitionsOf(manifest, ['member'])).toBe(definitionsHeld);
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

  it('a set holding a definition nova does not read is refused with a sentence, tried or handed over, and nothing is switched', () => {
    const manifest = running(shippedApp());
    // As it arrives from rows: the compiler is told it is an action.
    const typo: Record<string, ActionDefinition> = { [desk.id]: JSON.parse('{"id":"ext.belts.desk","tittle":"A typo"}') };
    const inForce = manifest.actions();

    expect(manifest.verifyReplace('bundles', typo).errors).toEqual([{ check: 'actions', detail: '"ext.belts.desk" is not an action nova reads: (root): Unrecognized key: "tittle"' }]);
    expect(() => manifest.replace('bundles', typo)).toThrow(/^Refresh refused — actions nova does not read:\n {2}"ext\.belts\.desk" is not an action nova reads: \(root\): Unrecognized key: "tittle"$/);
    expect(manifest.actions()).toBe(inForce);
    // Not frozen either: it was not taken.
    expect(Object.isFrozen(typo)).toBe(false);
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

  // What a shell is built from: the definitions themselves, with the grant and
  // the layout variant already applied. This is the one place either is.
  it('the definitions held are the granted ones, each with the layout variant those roles hold in its place', () => {
    const base: ActionDefinition = { id: 'panel', layout: { component: 'Text', children: 'base' } };
    const shipped: ShippedManifest = {
      ...shippedApp(),
      charter: { public: ['home'], member: { actions: ['home', 'panel', 'ext.*'] }, lead: { extends: ['member'], layouts: ['panel.wide'] } },
      actions: { home, panel: base },
      layouts: { 'panel.wide': { action: 'panel', layout: { component: 'Text', children: 'wide' } } },
    };
    const manifest = running(shipped);
    manifest.replace('bundles', { [desk.id]: desk, [pay.id]: pay });

    const member = definitionsOf(manifest, ['member'], ['belts']);
    expect(Object.keys(member)).toEqual(manifest.catalogFor(['member'], ['belts']).ids);
    // Held as the manifest has them: the same objects, no copy.
    expect(member['panel']).toBe(base);
    expect(member[desk.id]).toBe(desk);
    expect(member[pay.id]).toBeUndefined();
    expect(Object.keys(definitionsOf(manifest, ['public']))).toEqual(['home']);

    // The variant is a copy that differs in its layout: the base is not edited.
    const lead = definitionsOf(manifest, ['lead'], ['belts']);
    expect(lead['panel']).toEqual({ id: 'panel', layout: { component: 'Text', children: 'wide' } });
    expect(base.layout).toEqual({ component: 'Text', children: 'base' });
    expect(lead['home']).toBe(home);

    // Kept like the catalog, and dropped with it at a switch.
    expect(definitionsOf(manifest, ['lead'], ['belts'])).toBe(lead);
    manifest.replace('bundles', { [desk.id]: desk });
    expect(definitionsOf(manifest, ['lead'], ['belts'])).not.toBe(lead);
    expect(Object.keys(definitionsOf(manifest, ['member']))).toEqual([desk.id, 'home', 'panel']);
  });

  // The one answer a shell is built from and adopts: every kind of artifact it
  // loads, for the shell manifest it is asked for and a set of roles.
  it('what a shell is made of is one answer: the definitions held, the shell as its manifest says it, and the entries', () => {
    const wide = { component: 'Text', children: 'wide' };
    const shipped: ShippedManifest = {
      ...shippedApp(),
      charter: { public: ['home'], member: { actions: ['home', 'panel'], layouts: ['panel.wide'] } },
      actions: { home, panel: { id: 'panel', layout: { component: 'Text', children: 'base' } } },
      layouts: { 'panel.wide': { action: 'panel', layout: wide } },
    };
    const shell: ShellManifest = {
      canvases: [{ id: 'main', initial: 'home' }],
      layout: { component: 'Frame', children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }, { ref: 'dock' }] },
      layoutStore: { dock: { component: 'Text', children: 'dock' } },
      fragments: { sheet: { kind: 'fragment', id: 'sheet', layout: { component: 'Sheet', children: [{ slot: 'body' }] } } },
    };
    const page: ShellManifest = { canvases: [{ id: 'main', initial: 'panel' }] };
    const manifest = running(shipped);

    const made = manifest.artifactsFor(shell, ['member'], undefined);
    expect(Object.keys(made.actions)).toEqual(['home', 'panel']);
    expect(made.actions['panel']?.layout).toBe(wide);
    expect(made.canvases).toBe(shell.canvases);
    expect(made.frame).toBe(shell.layout);
    expect(made.layoutStore).toBe(shell.layoutStore);
    expect(made.fragments).toBe(shell.fragments);
    expect([...made.entries.keys()]).toEqual(['deals/open']);
    expect(Object.keys(made.components).sort()).toEqual(['ActionSlot', 'CanvasSlot', 'Frame', 'Sheet', 'Text']);

    // Another shell manifest is another shell: what it does not declare is not
    // answered, and the roles still decide the definitions.
    const forPage = manifest.artifactsFor(page, ['public'], undefined);
    expect(forPage.canvases).toBe(page.canvases);
    expect('frame' in forPage || 'layoutStore' in forPage || 'fragments' in forPage).toBe(false);
    expect(Object.keys(forPage.actions)).toEqual(['home']);
    expect(forPage.entries).toBe(made.entries);
  });

  it('the component names a shell may mention are read off the actions in force and the shell, with the contracts it declares', () => {
    const manifest = running({ ...shippedApp(), actions: { home: { id: 'home', layout: { component: 'Heading', children: 'Home' } }, panel } });
    const shell = {
      canvases: [{ id: 'main', initial: 'home' }],
      layout: { component: 'Frame', children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }] },
      fragments: { sheet: { kind: 'fragment' as const, id: 'sheet', layout: { component: 'Sheet', children: [{ slot: 'body' }] } } },
      components: { Chart: { meta: { description: 'a chart' } } },
    };
    const componentsOf = (): Readonly<Record<string, unknown>> => manifest.artifactsFor(shell, ['public'], undefined).components;
    const read = componentsOf();
    // nova's two slot markers, what the layouts mention, and the declared contract.
    expect(Object.keys(read).sort()).toEqual(['ActionSlot', 'CanvasSlot', 'Chart', 'Frame', 'Heading', 'Sheet']);
    expect(read['Chart']).toEqual({ meta: { description: 'a chart' } });
    expect(read['Heading']).toEqual({});
    expect(componentsOf()).toBe(read);

    // A set that arrives mentions a component nothing shipped did: it is there
    // for the next shell that is built.
    manifest.replace('bundles', { [desk.id]: { id: desk.id, layout: { component: 'Ledger' } } });
    expect(Object.keys(componentsOf())).toContain('Ledger');
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
  // The pointer's row, as the manifest is handed it: one counter, moved by a
  // `move` here or by `poke`, which is what another process did.
  const pointerRow = (): { pointer: Pointer; poke: () => void; moves: () => number } => {
    const state = { n: 0, moves: 0 };
    return {
      pointer: {
        read: async () => state.n,
        move: async (from) => {
          if (state.n !== from) return false;
          state.n += 1;
          state.moves += 1;
          return true;
        },
      },
      poke: () => void (state.n += 1),
      moves: () => state.moves,
    };
  };
  const aMoment = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

  it('before it watches a switch moves nothing; after, each switch moves the pointer once', async () => {
    const { pointer, moves } = pointerRow();
    const manifest = running(shippedApp(), { pointer: { ...pointer, everyMs: 1 } });
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
    const { pointer, poke, moves } = pointerRow();
    const rows: { now: Record<string, ActionDefinition> } = { now: { [desk.id]: desk } };
    const shipped = shippedApp();
    const manifest = running(shipped, { loaders: { integrations: async () => rows.now }, pointer: { ...pointer, everyMs: 1 } });
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
    const { pointer, poke, moves } = pointerRow();
    const rows: { now: Record<string, ActionDefinition> } = { now: { [desk.id]: desk } };
    const manifest = running(shippedApp(), { pointer: { ...pointer, everyMs: 1 } });
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
    const { pointer, poke } = pointerRow();
    const manifest = running(shippedApp(), { pointer: { ...pointer, everyMs: 1 } });
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
