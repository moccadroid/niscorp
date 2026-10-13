import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { depthRefusal } from '@niscorp/strata';
import { z } from 'zod';
import { createRunningManifest, savedRowsOver } from '../src/artifactory';
import type { RunningManifest } from '../src/artifactory';
import type { RunningManifestConfig } from '../src/artifactory/running';
import type { SavedVersion } from '../src/artifactory/saves';
import { createGrammarUpgrader } from '../src/data/engine';
import type { NiscApp, SessionArtifacts, ShellManifest } from '../src/manifest';
import { rowsDouble } from './saved-double';
import type { RowsDouble } from './saved-double';

const saying = (text: string): LayoutNode => ({ component: 'Text', children: text });

const home: ActionDefinition = { id: 'home', data: { title: 'Hello' }, layout: saying('home, as built') };
const desk: ActionDefinition = { id: 'desk', layout: saying('desk, as built') };
const docked: ActionDefinition = { id: 'docked', layout: 'dock' };
const bare: ActionDefinition = { id: 'bare' };
const send: LayoutNode = { component: 'Button', ref: 'send' };
const form: ActionDefinition = {
  id: 'form',
  data: { title: '' },
  layout: { component: 'Stack', children: [{ component: 'Text', children: '$.title' }, send] },
  triggers: [{ event: 'ui:click', ref: 'send', do: [{ set: 'title', value: 'sent' }] }],
};
// As it is built, nova's audit finds something of this one: a control no trigger handles.
const flawed: ActionDefinition = { id: 'flawed', data: { title: '' }, layout: { component: 'Button', ref: 'nowhere' } };

const SHELL: ShellManifest = { canvases: [{ id: 'main', initial: 'home' }], components: { Heading: {} }, layoutStore: { dock: saying('the dock') } };

const app: NiscApp = {
  charter: {
    public: ['home'],
    member: { actions: ['home', 'docked', 'bare', 'form', 'flawed'] },
    lead: { extends: ['member'], actions: ['desk'], layouts: ['home.wide'] },
  },
  actions: { home, desk, docked, bare, form, flawed },
  layouts: { 'home.wide': { action: 'home', layout: saying('home, the leads’ variant') } },
  shell: SHELL,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type World = {
  running: RunningManifest;
  rows: RowsDouble;
  of: (principal: string | null, roles?: readonly string[]) => SessionArtifacts;
  published: SessionArtifacts;
  storeOf: (principal: string | null, roles?: readonly string[]) => Promise<Readonly<Record<string, LayoutNode>>>;
};

const world = (more: Partial<RunningManifestConfig> = {}, rows: RowsDouble = rowsDouble()): World => {
  const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [SHELL], published: () => rows.as('*').inForce(), ...more });
  return {
    running,
    rows,
    published: running.publishedArtifacts(rows.as('*')),
    of: (principal, roles = ['member']) => running.sessionArtifacts(principal, async () => ({ roles, installed: undefined, saved: rows.as(principal ?? 'nobody') })),
    storeOf: async (principal, roles = ['member']) =>
      (await running.artifactsFor(SHELL, { principal, roles, installed: undefined, ...(principal === null ? {} : { saved: rows.as(principal) }) })).layoutStore,
  };
};

const forAll = (ref: string, text: string): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref, layout: saying(text), use: true } });

const mine = (text: string, use?: boolean): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'action/home', layout: saying(text), ...(use === undefined ? {} : { use }) } });

describe('a layout saved from a session', () => {
  it('is its principal’s alone: marked in use, their shell’s store holds it under the action’s ref and nobody else’s does', async () => {
    const { of, storeOf, running, rows } = world();
    const saved = await of('ada').save([mine('home, as ada has it', true)]);

    expect(saved.save).toMatch(UUID);
    expect(saved.artifacts).toEqual([{ kind: 'layout', id: expect.stringMatching(UUID) }]);
    expect((await storeOf('ada'))['action/home']).toEqual(saying('home, as ada has it'));
    expect((await storeOf('ben'))['action/home']).toEqual(home.layout);
    expect((await storeOf(null, ['public']))['action/home']).toEqual(home.layout);
    expect((await running.artifactsFor(SHELL, { principal: 'ada', roles: ['member'], installed: undefined, saved: rows.as('ada') })).actions['home']?.layout).toEqual({ ref: 'action/home' });
  });

  it('is kept and not shown while it is not marked in use', async () => {
    const { of, storeOf } = world();
    const saved = await of('ada').save([mine('a draft of ada’s')]);

    expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
    expect((await of('ada').list('layout')).map((version) => version.id)).toEqual([saved.artifacts[0]?.id]);
  });

  it('of several of one’s own for one ref, the one marked in use shows, and marking another takes the mark off the first in the same save', async () => {
    const { of, storeOf, rows } = world();
    const ada = of('ada');
    const first = await ada.save([mine('the first', true)]);
    const second = await ada.save([mine('the second')]);
    expect((await storeOf('ada'))['action/home']).toEqual(saying('the first'));

    const marked = await ada.save([{ ...mine('the second', true), id: second.artifacts[0]?.id }]);

    expect((await storeOf('ada'))['action/home']).toEqual(saying('the second'));
    const listed = await ada.list();
    expect(listed.map((version) => [version.id, version.body])).toEqual(
      expect.arrayContaining([
        [first.artifacts[0]?.id, { ref: 'action/home', layout: saying('the first') }],
        [second.artifacts[0]?.id, { ref: 'action/home', layout: saying('the second'), use: true }],
      ]),
    );
    expect(listed).toHaveLength(2);
    const unmarked = rows.rows.find((row) => row.save === marked.save && row.id === first.artifacts[0]?.id);
    expect(unmarked?.copiedFrom).toBe(first.save);
  });

  it('with the mark taken off, the layout under it shows again and the layout is still kept', async () => {
    const { of, storeOf } = world();
    const ada = of('ada');
    const saved = await ada.save([mine('the first', true)]);
    await ada.save([{ ...mine('the first'), id: saved.artifacts[0]?.id }]);

    expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
    expect(await ada.list()).toHaveLength(1);
  });

  it('under an action’s ref the order is: one’s own marked in use, the layout variant of one’s roles, the build’s', async () => {
    const { of, storeOf } = world();
    expect((await storeOf('lea', ['lead']))['action/home']).toEqual(saying('home, the leads’ variant'));
    expect((await storeOf('ada'))['action/home']).toEqual(home.layout);

    await of('lea', ['lead']).save([mine('home, as lea has it', true)]);
    expect((await storeOf('lea', ['lead']))['action/home']).toEqual(saying('home, as lea has it'));
    expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
  });

  it('asks for a principal’s rows when their shell is asked for, and asks nothing for nobody but what is published, which is asked once', async () => {
    const { storeOf, rows } = world();
    await storeOf(null, ['public']);
    expect(rows.asked).toEqual(['*']);
    await storeOf('ada');
    expect(rows.asked).toEqual(['*', 'ada']);
  });

  it('tells whoever follows that principal, and nobody who follows what the app consists of: the generation pointer stays where it is', async () => {
    const moved = vi.fn(async () => true);
    const { of, running } = world({ pointer: { read: async () => 0, move: moved, everyMs: 60_000 } });
    running.watch();
    try {
      const changed = vi.fn();
      const changedFor = vi.fn();
      running.onChange(changed);
      running.onChangeFor(changedFor);

      await of('ada').save([mine('home, as ada has it', true)]);

      expect(changedFor.mock.calls).toEqual([['ada']]);
      expect(changed).not.toHaveBeenCalled();
      expect(moved).not.toHaveBeenCalled();
    } finally {
      running.stop();
    }
  });
});

describe('history, going back to a version, and reset', () => {
  it('every save of an artifact is a version, newest first; going back is a new save that holds a copy of the version and says which', async () => {
    const { of, storeOf } = world();
    const ada = of('ada');
    const first = await ada.save([mine('the first', true)]);
    const id = first.artifacts[0]?.id ?? '';
    const second = await ada.save([{ ...mine('the second', true), id }]);

    const before = await ada.history('layout', id);
    expect(before.map((version) => version.save)).toEqual([second.save, first.save]);

    const restored = await ada.restore('layout', id, first.save);

    expect((await storeOf('ada'))['action/home']).toEqual(saying('the first'));
    const after = await ada.history('layout', id);
    expect(after.map((version) => version.save)).toEqual([restored.save, second.save, first.save]);
    expect(after[0]?.body).toEqual(before[1]?.body);
    expect(after[0]?.copiedFrom).toBe(first.save);
  });

  it('reset says none of one’s own is in force under that id: what is under it shows, it is listed no longer, and its history keeps every version', async () => {
    const { of, storeOf } = world();
    const ada = of('ada');
    const saved = await ada.save([mine('home, as ada has it', true)]);
    const id = saved.artifacts[0]?.id ?? '';
    const reset = await ada.reset('layout', id);

    expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
    expect(await ada.list()).toEqual([]);
    expect((await ada.history('layout', id)).map((version) => [version.save, version.body === null])).toEqual([
      [reset.save, true],
      [saved.save, false],
    ]);

    await ada.restore('layout', id, saved.save);
    expect((await storeOf('ada'))['action/home']).toEqual(saying('home, as ada has it'));
  });
});

describe('what is refused, in a sentence, with nothing written', () => {
  const refused = async (run: (world: World) => Promise<unknown>, sentence: string | RegExp): Promise<void> => {
    const made = world();
    await expect(run(made)).rejects.toThrow(sentence);
    expect(made.rows.rows).toEqual([]);
  };

  it('a save in a session nobody is signed in to: its rows would be everybody’s who is not signed in', async () => {
    const sentence = 'moss: nobody is signed in to this session, and a save is somebody’s.';
    await refused(({ of }) => of(null, ['public']).save([mine('anybody’s')]), sentence);
    await refused(({ of }) => of(null, ['public']).reset('layout', 'anything'), sentence);
    await refused(({ of }) => of(null, ['public']).restore('layout', 'anything', '0b0e7a52-6f0e-4b8e-9d0c-1f2e3a4b5c6d'), sentence);
    const { of, rows } = world();
    expect(await of(null, ['public']).list()).toEqual([]);
    expect(await of(null, ['public']).history('layout', 'anything')).toEqual([]);
    expect(rows.asked).toEqual([]);
  });

  it('a save that holds nothing, or something that is not an artifact to save', async () => {
    const sentence = 'moss: a save holds one or several artifacts, each `{ kind, id?, body }` and nothing else.';
    await refused(({ of }) => of('ada').save([]), sentence);
    await refused(({ of }) => of('ada').save([{ ...mine('x'), for: 'everybody' } as unknown as { kind: 'layout'; body: unknown }]), sentence);
    await refused(({ of }) => of('ada').save('a layout' as unknown as []), sentence);
  });

  it('a kind moss does not save', () =>
    refused(({ of }) => of('ada').save([{ kind: 'action' as 'layout', body: { id: 'x' } }]), 'moss: "action" is not a kind that is saved. The kinds: layout.'));

  it('a body that is not a layout’s', () =>
    refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/home', layout: { component: 7 } } }]), /^moss: the layout for "action\/home" is refused: layout: /));

  it('a body that nests deeper than a document is ever written', async () => {
    const deep = Array.from({ length: 2000 }).reduce<LayoutNode>((inner) => ({ component: 'Stack', children: [inner] }), saying('the innermost'));
    await refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/home', layout: deep } }]), `moss: the layout for "action/home" is refused: ${depthRefusal()}`);
  });

  it('a ref no action of theirs keeps its layout under', async () => {
    const nothingUnder = (ref: string): string => `moss: the layout for "${ref}" is refused: nothing is kept under "${ref}". A saved layout takes the place of the layout of an action its holder has, under "action/<the action’s id>".`;
    await refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/gone', layout: saying('x') } }]), nothingUnder('action/gone'));
    await refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/desk', layout: saying('x') } }]), nothingUnder('action/desk'));
    await refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/docked', layout: saying('x') } }]), nothingUnder('action/docked'));
    await refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/bare', layout: saying('x') } }]), nothingUnder('action/bare'));
    await refused(({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'dock', layout: saying('x') } }]), nothingUnder('dock'));
  });

  it('a component the app has none for', () =>
    refused(
      ({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/home', layout: { component: 'Carousel' } } }]),
      'moss: the layout for "action/home" is refused: layout uses "Carousel", which this app has no component for',
    ));

  it('a layout that names the place an action’s layout is kept', () =>
    refused(
      ({ of }) => of('ada').save([{ kind: 'layout', body: { ref: 'action/home', layout: { component: 'Text', children: [{ ref: 'action/home' }] } } }]),
      'moss: the layout for "action/home" is refused: it names the layout "action/home": a name beginning with "action/" is where the layout of that action is kept',
    ));

  it('a layout nova’s audit finds something of with it in place of its action’s: a key the action has no data for, a control it listens on left out, a control no trigger handles', async () => {
    const forForm = (layout: LayoutNode): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'action/form', layout } });
    await refused(
      ({ of }) => of('ada').save([forForm({ component: 'Stack', children: [{ component: 'Text', children: '$.subtitle' }, send] })]),
      'moss: the layout for "action/form" is refused: layout binds "$.subtitle" but data has no "subtitle" default',
    );
    await refused(
      ({ of }) => of('ada').save([forForm({ component: 'Text', children: '$.title' })]),
      'moss: the layout for "action/form" is refused: trigger listens on ref "send" but no layout node carries it',
    );
    await refused(
      ({ of }) => of('ada').save([forForm({ component: 'Stack', children: [send, { component: 'Button', ref: 'other' }] })]),
      'moss: the layout for "action/form" is refused: layout ref "other" has no trigger — dead chrome',
    );
  });

  it('an id that is not one of theirs', () =>
    refused(({ of }) => of('ada').save([{ ...mine('x'), id: 'somebody-elses' }]), 'moss: there is no layout "somebody-elses" of yours. Leave the id out, and moss gives a new layout its id.'));

  it('two of one save marked in use for one ref', () =>
    refused(({ of }) => of('ada').save([mine('one', true), mine('two', true)]), 'moss: two layouts of one save are marked in use for "action/home". One is in use at a time.'));

  it('a reset of what is not in force, and a version that was never saved', async () => {
    await refused(({ of }) => of('ada').reset('layout', 'nothing'), 'moss: no layout "nothing" of yours is in force.');
    await refused(({ of }) => of('ada').restore('layout', 'nothing', 'no-save'), 'moss: no layout "nothing" of yours was saved in "no-save".');
  });

  it('nobody reaches another’s versions: not to list, not to go back to, not to reset', async () => {
    const { of, rows } = world();
    const saved = await of('ada').save([mine('home, as ada has it', true)]);
    const id = saved.artifacts[0]?.id ?? '';
    const written = rows.rows.length;
    const ben = of('ben');

    expect(await ben.list()).toEqual([]);
    expect(await ben.history('layout', id)).toEqual([]);
    await expect(ben.restore('layout', id, saved.save)).rejects.toThrow(`moss: no layout "${id}" of yours was saved in "${saved.save}".`);
    await expect(ben.reset('layout', id)).rejects.toThrow(`moss: no layout "${id}" of yours is in force.`);
    await expect(ben.save([{ ...mine('x'), id }])).rejects.toThrow(`moss: there is no layout "${id}" of yours.`);
    expect(rows.rows).toHaveLength(written);
  });
});

describe('what nova’s audit finds of an action as it is built', () => {
  it('is not held against a layout saved for it: only what the saved layout adds is', async () => {
    const { of, storeOf } = world();
    const kept: LayoutNode = { component: 'Stack', children: [{ component: 'Text', children: '$.title' }, { component: 'Button', ref: 'nowhere' }] };

    await of('ada').save([{ kind: 'layout', body: { ref: 'action/flawed', layout: kept, use: true } }]);
    expect((await storeOf('ada'))['action/flawed']).toEqual(kept);

    await expect(of('ada').save([{ kind: 'layout', body: { ref: 'action/flawed', layout: { component: 'Button', ref: 'elsewhere' } } }])).rejects.toThrow(
      'moss: the layout for "action/flawed" is refused: layout ref "elsewhere" has no trigger — dead chrome',
    );
  });
});

describe('a saved layout that does not pass any more', () => {
  const stored = async (rows: RowsDouble, principal: string, id: string, body: unknown): Promise<void> =>
    rows.as(principal).write({ id: `save-of-${id}`, versions: [{ kind: 'layout', id, body, copiedFrom: null }] });

  const saidWhile = async (run: (said: ReturnType<typeof vi.spyOn>) => Promise<void>): Promise<void> => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await run(said);
    } finally {
      said.mockRestore();
    }
  };

  it('is left out with a line, and what is under it shows; one for an action its holder has no longer is not loaded, and nothing is said', () =>
    saidWhile(async (said) => {
      const rows = rowsDouble();
      await stored(rows, 'ada', 'broken', { ref: 'action/home', layout: { component: 'Carousel' }, use: true });
      await stored(rows, 'lea', 'for-desk', { ref: 'action/desk', layout: saying('desk, as lea has it'), use: true });
      const { storeOf } = world({}, rows);

      expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
      expect((await storeOf('lea', ['lead']))['action/desk']).toEqual(saying('desk, as lea has it'));
      expect(Object.keys(await storeOf('lea', ['member']))).not.toContain('action/desk');
      expect(said.mock.calls).toEqual([['[moss] the layout "broken" of ada is left out: layout uses "Carousel", which this app has no component for']]);
    }));

  it('one that the audit finds something of now, with the action as it is built today, is left out the same way', () =>
    saidWhile(async (said) => {
      const rows = rowsDouble();
      await stored(rows, 'ada', 'stale', { ref: 'action/form', layout: { component: 'Stack', children: [{ component: 'Text', children: '$.gone' }, send] }, use: true });
      const { storeOf } = world({}, rows);

      expect((await storeOf('ada'))['action/form']).toEqual(form.layout);
      expect(said.mock.calls).toEqual([['[moss] the layout "stale" of ada is left out: layout binds "$.gone" but data has no "gone" default']]);
    }));

  it('a version the rows could not read is left out the same way', () =>
    saidWhile(async (said) => {
      const rows = rowsDouble();
      await stored(rows, 'ada', 'newer', { ref: 'action/home', layout: saying('from a newer grammar'), use: true });
      const unread = rows.rows[0];
      if (unread !== undefined) unread.unread = 'it was written in a newer grammar than this server runs';
      const { storeOf } = world({}, rows);

      expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
      expect(said.mock.calls).toEqual([['[moss] the layout "newer" of ada is left out: it was written in a newer grammar than this server runs']]);
    }));

  it('a published one is left out the same way, with a line that is said once and not at every shell', () =>
    saidWhile(async (said) => {
      const rows = rowsDouble();
      await stored(rows, '*', 'broken', { ref: 'action/home', layout: { component: 'Carousel' }, use: true });
      const { storeOf, running } = world({}, rows);
      await running.readPublished();

      expect((await storeOf('ada'))['action/home']).toEqual(home.layout);
      expect((await storeOf('ben'))['action/home']).toEqual(home.layout);
      expect(said.mock.calls).toEqual([['[moss] the layout "broken" published for everybody is left out: layout uses "Carousel", which this app has no component for']]);
    }));

  it('is not written again when another is marked in use: it would carry this server’s stamp over a grammar it is not in', async () => {
    const rows = rowsDouble();
    await stored(rows, 'ada', 'newer', { ref: 'action/home', layout: saying('from a newer grammar'), use: true });
    const unread = rows.rows[0];
    if (unread !== undefined) unread.unread = 'it was written in a newer grammar than this server runs';
    const { of } = world({}, rows);

    await of('ada').save([mine('home, as ada has it', true)]);

    expect(rows.rows.map((row) => row.id === 'newer')).toEqual([true, false]);
  });

  it('of two marked in use for one ref, as two saves at once can leave them, the later shows', async () => {
    const rows = rowsDouble();
    await stored(rows, 'ada', 'earlier', { ref: 'action/home', layout: saying('the earlier'), use: true });
    await stored(rows, 'ada', 'later', { ref: 'action/home', layout: saying('the later'), use: true });
    const { storeOf, of } = world({}, rows);

    expect((await storeOf('ada'))['action/home']).toEqual(saying('the later'));

    await of('ada').save([{ kind: 'layout', id: 'earlier', body: { ref: 'action/home', layout: saying('the earlier'), use: true } }]);
    expect((await storeOf('ada'))['action/home']).toEqual(saying('the earlier'));
    expect((await of('ada').list()).filter((version) => JSON.stringify(version.body).includes('"use":true')).map((version) => version.id)).toEqual(['earlier']);
  });

  const twoMarked = async (): Promise<World> => {
    const rows = rowsDouble();
    await stored(rows, 'ada', 'earlier', { ref: 'action/home', layout: saying('the earlier'), use: true });
    await stored(rows, 'ada', 'later', { ref: 'action/home', layout: saying('the later'), use: true });
    return world({}, rows);
  };
  const markedOf = async ({ of }: World): Promise<string[]> =>
    (await of('ada').list()).filter((version) => JSON.stringify(version.body).includes('"use":true')).map((version) => version.id);

  it('of two marked in use for one ref, a reset of the one that is drawn shows what is under both, and not the other of the two', async () => {
    const made = await twoMarked();
    await made.of('ada').reset('layout', 'later');

    expect((await made.storeOf('ada'))['action/home']).toEqual(home.layout);
    expect(await markedOf(made)).toEqual([]);
    expect((await made.of('ada').list()).map((version) => version.id)).toEqual(['earlier']);
  });

  it('...and so does a save of it without the mark', async () => {
    const made = await twoMarked();
    await made.of('ada').save([{ kind: 'layout', id: 'later', body: { ref: 'action/home', layout: saying('the later') } }]);

    expect((await made.storeOf('ada'))['action/home']).toEqual(home.layout);
    expect(await markedOf(made)).toEqual([]);
  });

  it('a reset of one that is not in use leaves the one that is', async () => {
    const { of, storeOf } = world();
    const ada = of('ada');
    await ada.save([mine('in use', true)]);
    const spare = await ada.save([mine('a spare')]);
    await ada.reset('layout', spare.artifacts[0]?.id ?? '');

    expect((await storeOf('ada'))['action/home']).toEqual(saying('in use'));
  });
});

describe('a layout published for everybody', () => {
  it('is drawn for everybody who holds its action: under one’s own in use and the layout variant of one’s roles, over the build’s', async () => {
    const { of, published, storeOf } = world();
    await of('ada').save([mine('home, as ada has it', true)]);
    await published.save([forAll('action/home', 'home, as published')]);

    expect((await storeOf('ben'))['action/home']).toEqual(saying('home, as published'));
    expect((await storeOf(null, ['public']))['action/home']).toEqual(saying('home, as published'));
    expect((await storeOf('ada'))['action/home']).toEqual(saying('home, as ada has it'));
    expect((await storeOf('lea', ['lead']))['action/home']).toEqual(saying('home, the leads’ variant'));
  });

  it('is announced whether or not this process can read the rows afterwards, and a read that failed is made again by the next shell', async () => {
    const rows = rowsDouble();
    const away = { reads: 0 };
    const reader = async (): Promise<SavedVersion[]> => {
      if (away.reads > 0) {
        away.reads -= 1;
        throw new Error('the database went away');
      }
      return rows.as('*').inForce();
    };
    const moved = vi.fn(async () => true);
    const { published, storeOf, running } = world({ published: reader, pointer: { read: async () => 0, move: moved, everyMs: 60_000 } }, rows);
    running.watch();
    try {
      const changed = vi.fn();
      running.onChange(changed);
      away.reads = 1;

      await published.save([forAll('action/home', 'home, as published')]);

      expect(changed).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(moved).toHaveBeenCalledTimes(1));
      await expect(storeOf('ben')).rejects.toThrow('the database went away');
      expect((await storeOf('ben'))['action/home']).toEqual(saying('home, as published'));
      await expect(running.readPublished()).resolves.toBeUndefined();
      away.reads = 1;
      await expect(running.readPublished()).rejects.toThrow('the database went away');
    } finally {
      running.stop();
    }
  });

  it('of two publishes close together the later is drawn, though a read of the rows begun before it answers after it', async () => {
    const rows = rowsDouble();
    const held: (() => void)[] = [];
    const holding = { reads: false };
    const reader = async (): Promise<SavedVersion[]> => {
      const read = await rows.as('*').inForce();
      if (holding.reads) await new Promise<void>((release) => held.push(release));
      return read;
    };
    const { published, storeOf } = world({ published: reader }, rows);
    await published.save([forAll('action/home', 'the first')]);
    holding.reads = true;
    const early = storeOf('ben');
    await vi.waitFor(() => expect(held).toHaveLength(1));
    holding.reads = false;

    await published.save([forAll('action/home', 'the second')]);

    expect((await storeOf('cy'))['action/home']).toEqual(saying('the second'));
    held[0]?.();
    expect((await early)['action/home']).toEqual(saying('the first'));
    expect((await storeOf('dan'))['action/home']).toEqual(saying('the second'));
  });

  it('one for an action that only some hold is drawn for them, and is not loaded for the rest', async () => {
    const { published, storeOf } = world();
    await published.save([forAll('action/desk', 'desk, as published')]);

    expect((await storeOf('lea', ['lead']))['action/desk']).toEqual(saying('desk, as published'));
    expect(Object.keys(await storeOf('ada'))).not.toContain('action/desk');
  });

  it('is kept as rows no session reaches, and one read of them answers every shell until the next publish', async () => {
    const { of, published, storeOf, rows } = world();
    const saved = await published.save([forAll('action/home', 'home, as published')]);
    const id = saved.artifacts[0]?.id ?? '';

    expect(rows.rows.map((row) => row.principal)).toEqual(['*']);
    expect(await of('ada').list()).toEqual([]);
    expect(await of('ada').history('layout', id)).toEqual([]);
    await expect(of('ada').reset('layout', id)).rejects.toThrow(`moss: no layout "${id}" of yours is in force.`);
    await expect(of('ada').save([{ ...mine('x', true), id }])).rejects.toThrow(`moss: there is no layout "${id}" of yours.`);
    expect(rows.rows).toHaveLength(1);

    rows.asked.length = 0;
    await storeOf('ben');
    await storeOf('cy');
    expect(rows.asked).toEqual(['ben', '*', 'cy']);
  });

  it('has the calls a person’s has: several are kept and one is in use, each publish is a version, and a reset shows the build’s again', async () => {
    const { published, storeOf } = world();
    const first = await published.save([forAll('action/home', 'the first')]);
    const second = await published.save([forAll('action/home', 'the second')]);
    const [firstId, secondId] = [first.artifacts[0]?.id ?? '', second.artifacts[0]?.id ?? ''];
    const inUse = async (): Promise<string[]> => (await published.list()).filter((version) => JSON.stringify(version.body).includes('"use":true')).map((version) => version.id);

    expect((await storeOf('ben'))['action/home']).toEqual(saying('the second'));
    expect((await published.list('layout')).map((version) => version.id).sort()).toEqual([firstId, secondId].sort());
    expect(await inUse()).toEqual([secondId]);

    const restored = await published.restore('layout', firstId, first.save);
    expect((await storeOf('ben'))['action/home']).toEqual(saying('the first'));
    expect(await inUse()).toEqual([firstId]);
    expect((await published.history('layout', firstId)).map((version) => version.save)).toEqual([restored.save, second.save, first.save]);

    await published.reset('layout', firstId);
    expect((await storeOf('ben'))['action/home']).toEqual(home.layout);
    expect((await published.list()).map((version) => version.id)).toEqual([secondId]);
  });

  it('tells whoever follows what the app consists of, and nobody who follows one principal; the generation pointer moves, so that every process reads it', async () => {
    const moved = vi.fn(async () => true);
    const { published, running } = world({ pointer: { read: async () => 0, move: moved, everyMs: 60_000 } });
    running.watch();
    try {
      const changed = vi.fn();
      const changedFor = vi.fn();
      running.onChange(changed);
      running.onChangeFor(changedFor);

      await published.save([forAll('action/home', 'home, as published')]);

      expect(changed).toHaveBeenCalledTimes(1);
      expect(changedFor).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(moved).toHaveBeenCalledTimes(1));
    } finally {
      running.stop();
    }
  });

  it('what is refused of a publish, in a sentence, with nothing written', async () => {
    const { of, published, rows } = world();
    const nothingUnder = (ref: string): string => `moss: the layout for "${ref}" is refused: nothing is kept under "${ref}". A saved layout takes the place of the layout of an action its holder has, under "action/<the action’s id>".`;
    await expect(published.save([forAll('action/gone', 'x')])).rejects.toThrow(nothingUnder('action/gone'));
    await expect(published.save([forAll('action/docked', 'x')])).rejects.toThrow(nothingUnder('action/docked'));
    await expect(published.save([forAll('dock', 'x')])).rejects.toThrow(nothingUnder('dock'));
    await expect(published.save([{ kind: 'layout', body: { ref: 'action/home', layout: { component: 'Carousel' }, use: true } }])).rejects.toThrow(
      'moss: the layout for "action/home" is refused: layout uses "Carousel", which this app has no component for',
    );
    await expect(published.save([{ kind: 'layout', body: { ref: 'action/form', layout: saying('with the control left out'), use: true } }])).rejects.toThrow(
      'moss: the layout for "action/form" is refused: trigger listens on ref "send" but no layout node carries it',
    );
    expect(rows.rows).toEqual([]);

    const adas = await of('ada').save([mine('home, as ada has it', true)]);
    const id = adas.artifacts[0]?.id ?? '';
    await expect(published.save([{ ...forAll('action/home', 'x'), id }])).rejects.toThrow(
      `moss: there is no layout "${id}" published for everybody. Leave the id out, and moss gives a new layout its id.`,
    );
    await expect(published.reset('layout', id)).rejects.toThrow(`moss: no layout "${id}" published for everybody is in force.`);
    await expect(published.restore('layout', id, adas.save)).rejects.toThrow(`moss: no layout "${id}" published for everybody was saved in "${adas.save}".`);
    expect(await published.list()).toEqual([]);
    expect(rows.rows.map((row) => row.principal)).toEqual(['ada']);
  });
});

describe('what is published, in a deployment of several processes', () => {
  const EVERY_MS = 1_000;
  const aMoment = (): Promise<unknown> => vi.advanceTimersByTimeAsync(EVERY_MS);
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a process reads it from the rows when it boots, and again when the generation pointer moves', async () => {
    const at = { n: 0 };
    const pointer = {
      read: async () => at.n,
      move: async (from: number) => {
        if (at.n !== from) return false;
        at.n += 1;
        return true;
      },
      everyMs: EVERY_MS,
    };
    const rows = rowsDouble();
    const here = world({ pointer }, rows);
    await here.published.save([forAll('action/home', 'home, as published')]);
    const there = world({ pointer }, rows);
    try {
      await there.running.readPublished();
      expect((await there.storeOf('ben'))['action/home']).toEqual(saying('home, as published'));

      here.running.watch();
      there.running.watch();
      await aMoment();
      const told = vi.fn();
      there.running.onChange(told);

      await here.published.save([forAll('action/home', 'published again')]);
      await aMoment();

      expect(told).toHaveBeenCalledTimes(1);
      expect((await there.storeOf('ben'))['action/home']).toEqual(saying('published again'));
    } finally {
      here.running.stop();
      there.running.stop();
    }
  });
});

describe('whose rows a call reaches', () => {
  it('a caller’s with their scope, what is published as everybody’s with who published it, and no caller is everybody', async () => {
    const replayed: Record<string, unknown>[] = [];
    const rowsOf = savedRowsOver(async (_fingerprint, _context, scope = {}) => (replayed.push(scope), []), await createGrammarUpgrader({}));

    await rowsOf.of({ userId: 'ada', studioId: 's_1' }).inForce();
    await rowsOf.published('pat').write({ id: 'a-save', versions: [] });
    await rowsOf.published().inForce();

    expect(replayed).toEqual([{ userId: 'ada', studioId: 's_1', artifactSavedBy: 'ada' }, { userId: '*', artifactSavedBy: 'pat' }, { userId: '*' }]);
    // Who made a save is moss's to say: a caller's scope that says it, as an app's `scope` could, is refused.
    expect(() => rowsOf.of({ userId: 'ada', artifactSavedBy: 'pat' })).toThrow(
      'moss: a caller’s scope carries `artifactSavedBy`. Who made a save is written from that value, and it is moss’s to say: the app’s `scope` names its own otherwise.',
    );
    expect(() => rowsOf.of({ userId: '*' })).toThrow(
      'moss: a caller’s `userId` is "*", and that is whose the rows published for everybody are. No caller is it: the app’s sign-in or its `scope` answers another.',
    );
  });
});

describe('an app with several shells', () => {
  const page: ShellManifest = { canvases: [{ id: 'main', initial: 'home' }] };
  const heading: LayoutNode = { component: 'Heading', children: 'home, as ada has it' };

  it('a layout is saved where any shell can draw it, and left out of a shell that cannot, with a line', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const rows = rowsDouble();
      const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [SHELL, page] });
      const ada = { principal: 'ada', roles: ['member'], installed: undefined, saved: rows.as('ada') };
      const saved = await running.sessionArtifacts('ada', async () => ada).save([{ kind: 'layout', body: { ref: 'action/home', layout: heading, use: true } }]);

      expect((await running.artifactsFor(SHELL, ada)).layoutStore['action/home']).toEqual(heading);
      expect(said).not.toHaveBeenCalled();
      expect((await running.artifactsFor(page, ada)).layoutStore['action/home']).toEqual(home.layout);
      expect(said.mock.calls).toEqual([[`[moss] the layout "${saved.artifacts[0]?.id}" of ada is left out: layout uses "Heading", which this app has no component for`]]);
    } finally {
      said.mockRestore();
    }
  });

  it('what one shell says of a component’s props holds, though another lists the component and says nothing', async () => {
    const strict: ShellManifest = { ...SHELL, components: { Heading: { meta: { propsSchema: z.object({ level: z.number() }) } } } };
    const silent: ShellManifest = { ...page, components: { Heading: {} } };
    for (const shells of [[strict, silent], [silent, strict]]) {
      const rows = rowsDouble();
      const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells });
      const ada = running.sessionArtifacts('ada', async () => ({ roles: ['member'], installed: undefined, saved: rows.as('ada') }));
      await expect(ada.save([{ kind: 'layout', body: { ref: 'action/home', layout: { component: 'Heading', props: { bogus: 1 } } } }])).rejects.toThrow(
        'moss: the layout for "action/home" is refused: "Heading" has no prop "bogus"',
      );
    }
  });
});
