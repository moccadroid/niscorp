import { resolvePrincipal } from '@niscorp/charter';
import type { ActionDefinition } from '@niscorp/nova';
import type { CacheEntry, SeedEntry, SeedMutation } from '@niscorp/vex';
import { NOBODY_USER_ID } from '../identity';
import {
  actionOfLayoutRef,
  candidateOf,
  charterOverFunctions,
  entriesOf,
  entryMisfits,
  freezeDeep,
  functionsIn,
  functionsWarning,
  refusalOf,
  verifiedAtBoot,
  verifyManifest,
  withFragments,
} from '../manifest';
import type { DraftArtifact, KitComponents, ManifestCandidate, ManifestReport, SessionArtifacts, ShellManifest, ShippedManifest, WrittenFunctions } from '../manifest';
import type { ShellArtifacts } from './artifacts';
import { createComponentNames, shellComponents, shellWithStoredLayouts, slottedCanvases } from './artifacts';
import { draftSaving, laidOver } from './draft';
import { answeredRead, compiledRead, readsInForce, seedOf } from './reads';
import type { ReadHeldTo, ReadSources, SavedRead } from './reads';
import { compileEntries, createEntriesInForce } from './entries';
import { createGeneration } from './generation';
import type { Generation, Pointer } from './generation';
import { catalogOfGenerated, generatedInForce } from './generated';
import type { GeneratedHeldTo } from './generated';
import { actionAtRef, layoutsInUse } from './layouts';
import { NO_DEFAULTS, checkedDefaults, createPublishedMemo, drawableIn, hasDefaults } from './published';
import type { Defaults, DefaultsHeldTo } from './published';
import type { LayoutHeldTo } from './layouts';
import { actionsWithStoredLayouts, createRoleMemo, narrowedBy } from './roles';
import type { Catalog, CatalogFilter, StoredLayouts } from './roles';
import type { SavedRows, SavedVersion } from './saves';
import { savedArtifacts } from './session';
import type { HeldTo, SavedArtifactsDeps, Written } from './session';
import { createSetOwners } from './sets';

type Actions = Readonly<Record<string, ActionDefinition>>;

export type ActionLoader = () => Promise<Record<string, ActionDefinition>>;

export type RunningManifestConfig = {
  shipped: ShippedManifest;
  grants: readonly string[];
  installedOnly?: CatalogFilter;
  pointer?: Pointer & { everyMs?: number };
  // Every shell the app has: what one of them can draw, a saved layout may name.
  shells: readonly ShellManifest[];
  // What is published for everybody and in force, asked of the rows.
  published?: () => Promise<readonly SavedVersion[]>;
  // Where a read somebody generated is taken from and checked against, and whose
  // rows a scope reaches. Absent: no read is saved, and none is answered.
  reads?: ReadSources & { savedOf: (scope: Record<string, unknown>) => SavedRows };
};

// `replayable`: the fingerprints their policy may replay. Absent: none.
export type RolesHeld = { roles: readonly string[]; installed: readonly string[] | undefined; replayable?: () => Promise<readonly string[]> };

// Whoever a session is for, as the server resolved them: what they hold, and their rows.
export type Caller = RolesHeld & { saved: SavedRows };

// `saved`: the rows of that principal. Nobody signed in has none.
// `drafted`: what the draft of the shell this is asked for holds.
export type Who = RolesHeld & { principal: string | null; saved?: SavedRows; drafted?: readonly DraftArtifact[] };

export type OwnedActions = {
  replace: (actions: Record<string, ActionDefinition>) => void;
  setLoader: (load: ActionLoader) => void;
};

export type RunningManifest = {
  actions: () => Actions;
  entries: () => readonly (SeedEntry | SeedMutation)[];
  verify: (actions: Actions) => ManifestReport;
  report: () => ManifestReport;
  replace: (source: string, actions: Record<string, ActionDefinition>) => void;
  replaceEntries: (source: string, entries: readonly (SeedEntry | SeedMutation)[]) => Promise<void>;
  // What the first shell's `functions(session)` returned. The app's functions are known
  // only once a session is: this is when they are checked, and the boot refuses on them.
  functionsWritten: (written: WrittenFunctions) => void;
  // `scope`: whose request asks. A read somebody saved is answered to them and to nobody else.
  cacheEntry: (fingerprint: string, scope?: Record<string, unknown>) => Promise<CacheEntry | undefined>;
  cacheEntries: () => Promise<{ key: string; entry: CacheEntry }[]>;
  claim: (source: string, owner: string) => OwnedActions;
  refresh: () => void;
  watch: () => void;
  onChange: (listener: () => void) => () => void;
  addCatalogFilter: (filter: CatalogFilter) => void;
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  artifactsFor: (shell: ShellManifest, who: Who) => Promise<ShellArtifacts>;
  sessionArtifacts: (principal: string | null, callerOf: () => Promise<Caller>) => SessionArtifacts;
  // `shell`: the one the draft is in. What is put into it is held to what that shell can draw.
  draftSavingFor: (shell: ShellManifest, principal: string | null, callerOf: () => Promise<Caller>) => ReturnType<typeof draftSaving>;
  // `saved`: the rows of what is published. `publisher`: whose roles and reads a publish is held to.
  publishedArtifacts: (saved: SavedRows, publisher: () => Promise<Pick<RolesHeld, 'roles' | 'replayable'>>) => SessionArtifacts;
  // Asks the rows what is published, so that a boot that cannot read it fails.
  // One answer serves every shell until this process publishes or the pointer
  // moves: the next shell then asks again.
  readPublished: () => Promise<void>;
  onChangeFor: (listener: (principal: string) => void) => () => void;
  generation: () => number;
  stop: () => void;
};

const mergedActions = (own: Actions, sets: ReadonlyMap<string, Actions>, over: Actions = {}): Actions =>
  Object.freeze([...sets.values(), over].reduce<Record<string, ActionDefinition>>((all, set) => ({ ...all, ...set }), { ...own }));

const tell = <Told extends unknown[]>(listener: (...told: Told) => void, ...told: Told): void => {
  try {
    listener(...told);
  } catch (error) {
    console.error('[moss:manifest] a listener to a manifest change threw:', error);
  }
};

export const createRunningManifest = (config: RunningManifestConfig): RunningManifest => {
  const { shipped } = config;
  const entries = createEntriesInForce(entriesOf(shipped));
  let defaults: Defaults = NO_DEFAULTS;
  let functionIds: ReadonlySet<string> | undefined;
  const candidate = (actions: Actions, held = entries.list(), fragments = defaults.fragments): ManifestCandidate =>
    withFragments({ ...candidateOf(shipped, { actions, entries: held }, config.grants), ...(functionIds === undefined ? {} : { functionIds }) }, fragments);

  const own: Actions = shipped.actions;
  const loaders = new Map<string, ActionLoader>();
  const owners = createSetOwners();
  let sets: ReadonlyMap<string, Actions> = new Map();
  let inForce = mergedActions(own, sets);

  let report = verifiedAtBoot(candidate(inForce));

  const components = createComponentNames((shell) => shellComponents({ actions: inForce, layouts: shipped.layouts }, shell));

  // Of two shells that list one component, what one of them says of its props is kept.
  const componentsOf = (shells: readonly ShellManifest[]): KitComponents => {
    const kit = new Map<string, { propsSchema?: unknown }>();
    for (const shell of shells) {
      for (const [name, contract] of Object.entries(components.of(shell))) kit.set(name, { propsSchema: contract.meta?.propsSchema ?? kit.get(name)?.propsSchema });
    }
    return kit;
  };
  // Read again when what is in force changes.
  let ofTheApp: KitComponents | undefined;
  const dropMemos = (): void => {
    roleMemo.drop();
    components.drop();
    ofTheApp = undefined;
  };

  const catalogFilters: CatalogFilter[] = config.installedOnly === undefined ? [] : [config.installedOnly];
  const roleMemo = createRoleMemo({
    manifest: () => ({ charter: shipped.charter, actions: inForce, layouts: shipped.layouts }),
    installedOnly: (ids, installed) => catalogFilters.reduce((kept, narrow) => narrowedBy(narrow, kept, installed), ids),
  });
  // A layout is saved for every shell its holder may open, and drawn by one:
  // at a save it is held to what any shell of the app can draw, and when a shell
  // is built to what that shell can.
  const kitOf = (shell?: ShellManifest): KitComponents => (shell === undefined ? (ofTheApp ??= componentsOf(config.shells)) : componentsOf([shell]));
  const ownShell = shipped.shell;
  const ownShellRefs: ReadonlySet<string> = new Set(ownShell === undefined ? [] : Object.keys(shellWithStoredLayouts(ownShell).layouts));
  const heldTo = ({ actions, layouts }: StoredLayouts, shell?: ShellManifest): LayoutHeldTo => {
    const kit = kitOf(shell);
    return {
      kit,
      // A layout saved for the frame or a canvas is the app's own shell's, whichever shell it is saved from.
      ...(ownShell !== undefined && (shell === undefined || shell === ownShell) ? { ownShell: { refs: ownShellRefs, kit: shell === ownShell ? kit : kitOf(ownShell) } } : {}),
      actionAt: actionAtRef(actions, layouts),
    };
  };
  const { reads: readSources } = config;
  const functionsWritten = (written: WrittenFunctions): void => {
    if (functionIds !== undefined) return;
    const ids = functionsIn(written).map((definition) => definition.id);
    const charter = charterOverFunctions(shipped.charter, { actions: Object.keys(inForce), data: config.grants, layouts: Object.keys(shipped.layouts ?? {}) }, ids);
    if (charter.errors.length > 0) throw new Error(`Charter is incoherent over the app’s functions — refusing to serve:\n  ${charter.errors.join('\n  ')}`);
    functionIds = new Set(ids);
    const built = mergedActions(own, sets);
    const verified = verifyManifest(candidate(built, entries.list(), {}));
    const refusal = refusalOf(verified, 'boot');
    if (refusal !== undefined) {
      functionIds = undefined;
      throw new Error(refusal);
    }
    report = verified;
    // What is published was read before the functions were known: it is read again against them.
    defaults = NO_DEFAULTS;
    inForce = built;
    dropMemos();
    memo.drop();
    for (const warning of charter.warnings) console.warn(`[moss] charter: ${warning}`);
    const warning = functionsWarning(written);
    if (warning !== undefined) console.warn(warning);
  };
  const grantedFunctionsOf =
    (roles: readonly string[]) =>
    (names: readonly string[]): ReadonlySet<string> =>
      resolvePrincipal(shipped.charter, names, roles, 'functions');
  const readsHeldTo: ReadHeldTo | undefined =
    readSources === undefined ? undefined : { isAppEntry: (fingerprint) => entries.byFingerprint().has(fingerprint), sources: readSources };
  // What somebody generated and has in force is laid beside what their roles
  // hold: an action of theirs may open either, and a layout of theirs may be for
  // either. `whose`: as a line says it of one that is left out. Absent: nothing is said.
  // `roles`: whose roles the functions a generated action calls are held to. Absent: it may call none.
  const heldWithGenerated = async (held: StoredLayouts, versions: readonly SavedVersion[], who: Partial<Pick<RolesHeld, 'replayable' | 'roles'>>, shell?: ShellManifest, whose?: string) => {
    let replayable: Promise<ReadonlySet<string>> | undefined;
    let catalog: ReturnType<GeneratedHeldTo['catalog']> | undefined;
    const reads = new Map([...defaults.reads, ...(readsHeldTo === undefined ? [] : await readsInForce(versions, readsHeldTo, whose))]);
    const checks: GeneratedHeldTo = {
      kit: kitOf(shell),
      entryOf: (fingerprint) => {
        const read = reads.get(fingerprint);
        return entries.byFingerprint().get(fingerprint) ?? (read === undefined ? undefined : seedOf(fingerprint, read));
      },
      replayable: () => (replayable ??= (async () => new Set([...((await who.replayable?.()) ?? []), ...reads.keys()]))()),
      mayCall: (name) => who.roles !== undefined && resolvePrincipal(shipped.charter, [name], who.roles, 'functions').has(name),
      catalog: () => (catalog ??= [...Object.values(held.actions).map((action) => ({ id: action.id, input: action.input ?? {} })), ...catalogOfGenerated(versions)]),
    };
    const passed = await generatedInForce(versions, checks, whose);
    const stored = actionsWithStoredLayouts(passed.actions);
    const all: StoredLayouts =
      Object.keys(passed.actions).length === 0 ? held : { actions: { ...held.actions, ...stored.actions }, layouts: { ...held.layouts, ...stored.layouts } };
    return { all, fragments: passed.fragments, heldTo: { layouts: heldTo(all, shell), generated: checks, ...(readsHeldTo !== undefined ? { reads: readsHeldTo } : {}) } satisfies HeldTo };
  };
  const listeners = new Set<() => void>();
  const listenersFor = new Set<(principal: string) => void>();
  const kinds: SavedArtifactsDeps['kinds'] = readSources === undefined ? ['layout', 'action', 'fragment'] : ['layout', 'action', 'fragment', 'read'];
  const sessionDeps = (principal: string | null, callerOf: () => Promise<Caller>, shell?: ShellManifest): SavedArtifactsDeps => ({
    whose: 'of yours',
    kinds,
    holder:
      principal === null
        ? undefined
        : async () => {
            await publishedNow();
            const caller = await callerOf();
            const held = roleMemo.storedLayoutsFor(caller.roles, caller.installed);
            return { saved: caller.saved, heldTo: async (inForce) => (await heldWithGenerated(held, inForce, caller, shell)).heldTo };
          },
    written: () => {
      if (principal !== null) for (const listener of [...listenersFor]) tell(listener, principal);
    },
  });
  let pointer: Generation | undefined;

  const memo = createPublishedMemo();
  const defaultsHeldTo = (): DefaultsHeldTo => ({
    kit: kitOf(),
    entryOf: (fingerprint) => entries.byFingerprint().get(fingerprint),
    fingerprints: () => entries.byFingerprint().keys(),
    reads: readsHeldTo,
    built: mergedActions(own, sets),
    candidate: (actions, fragments) => candidate(actions, entries.list(), fragments),
  });
  const applyPublished = async (versions: readonly SavedVersion[]): Promise<void> => {
    const over = sets;
    const { passed, reads, verified } = await checkedDefaults(versions, defaultsHeldTo(), 'published for everybody');
    if (sets !== over) return applyPublished(versions);
    const refusal = refusalOf(verified, 'boot');
    if (refusal !== undefined) memo.sayOnce(`[moss] what is published for everybody is left out, and the build’s copies stand: ${refusal}`);
    const next: Defaults = refusal === undefined ? { actions: passed.actions, fragments: passed.fragments, reads } : { ...NO_DEFAULTS, reads };
    if (!hasDefaults(next) && !hasDefaults(defaults)) return;
    defaults = next;
    if (refusal === undefined) report = verified;
    inForce = mergedActions(own, sets, defaults.actions);
    dropMemos();
  };
  const publishedNow = (): Promise<readonly SavedVersion[]> => {
    const held = memo.held();
    if (held !== undefined) return held;
    const read = (async () => {
      const versions = (await config.published?.()) ?? [];
      await applyPublished(versions);
      return versions;
    })();
    memo.keep(read);
    // A read that failed is made again by the next shell.
    read.catch(memo.drop);
    return read;
  };

  const applySets = (arrived: ReadonlyMap<string, Actions>, announce: boolean): void => {
    const next = new Map([...sets, ...arrived]);
    const actions = mergedActions(own, next, defaults.actions);
    const verified = verifyManifest(candidate(actions));
    const refusal = refusalOf(verified, 'refresh');
    if (refusal !== undefined) throw new Error(refusal);
    for (const set of arrived.values()) freezeDeep(set);
    sets = next;
    inForce = actions;
    report = verified;
    dropMemos();
    for (const listener of [...listeners]) tell(listener);
    if (announce) pointer?.bump();
  };

  // Switches without moving the pointer: answering another process's move with
  // a move would have the processes move each other's for ever.
  const reload = async (): Promise<void> => {
    const read: [string, Actions][] = [];
    for (const [source, load] of loaders) read.push([source, await load()]);
    memo.drop();
    applySets(new Map(read), false);
  };

  const takeEntries = async (source: string, handed: readonly (SeedEntry | SeedMutation)[]): Promise<void> => {
    owners.assertAppOwned(source);
    const misfits = entryMisfits(handed);
    if (misfits.length > 0) throw new Error(['Refresh refused — entries that do not parse:', ...misfits.map((misfit) => `  ${misfit}`)].join('\n'));
    const compiled = await compileEntries(handed);
    const verified = verifyManifest(candidate(inForce, entries.withSet(source, handed)));
    const refusal = refusalOf(verified, 'refresh');
    if (refusal !== undefined) throw new Error(refusal);
    freezeDeep(handed);
    entries.takeSet(source, handed, compiled);
    report = verified;
    for (const listener of [...listeners]) tell(listener);
    pointer?.bump();
  };
  let entriesTaken: Promise<void> = Promise.resolve();

  return {
    actions: () => inForce,
    entries: entries.list,
    verify: (actions) => verifyManifest(candidate(actions)),
    report: () => report,
    replace: (source, actions) => applySets(new Map([[owners.assertAppOwned(source), actions]]), true),
    // In turn: a set is compiled before it is taken, and of two handed over
    // the later has to be the one in force.
    replaceEntries: (source, handed) => {
      const taken = entriesTaken.then(() => takeEntries(source, handed));
      entriesTaken = taken.catch(() => undefined);
      return taken;
    },
    cacheEntry: async (fingerprint, scope) => {
      const shippedEntry = (await entries.compiled()).get(fingerprint);
      if (shippedEntry !== undefined || readSources === undefined || scope === undefined) return shippedEntry;
      const userId = scope['userId'];
      // What a caller saved is theirs alone; a caller nobody is signed in for saved nothing.
      if (typeof userId === 'string' && userId !== NOBODY_USER_ID) {
        // The newest version is the one in force: a reset writes one with no body, and what is published is then theirs too.
        const newest = (await readSources.savedOf(scope).history('read', fingerprint))[0];
        if (newest !== undefined && newest.body !== null && newest.unread === undefined) return answeredRead(fingerprint, newest.body);
      }
      await publishedNow();
      const everybodys = defaults.reads.get(fingerprint);
      return everybodys === undefined ? undefined : compiledRead(fingerprint, everybodys);
    },
    cacheEntries: async () => [...(await entries.compiled())].map(([key, entry]) => ({ key, entry })),
    claim: (source, owner) => {
      owners.claim(source, owner, sets.has(source) || entries.holdsSet(source));
      return {
        replace: (actions) => applySets(new Map([[source, actions]]), true),
        setLoader: (load) => {
          loaders.set(source, load);
          // The set takes its place now, empty, so the order the sets are
          // laid in does not depend on which of them is replaced first.
          if (!sets.has(source)) sets = new Map([...sets, [source, {}]]);
        },
      };
    },
    refresh: () => applySets(new Map(), true),
    functionsWritten,
    watch: () => {
      const where = config.pointer;
      if (pointer !== undefined || where === undefined) return;
      pointer = createGeneration({ read: where.read, move: where.move }, { onMoved: reload, ...(where.everyMs === undefined ? {} : { everyMs: where.everyMs }) });
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    addCatalogFilter: (filter) => {
      catalogFilters.push(filter);
      roleMemo.drop();
    },
    catalogFor: roleMemo.catalogFor,
    artifactsFor: async (shell, { principal, roles, installed, saved, replayable, drafted }) => {
      // Asked of the rows at every shell: what somebody saved in another process is theirs here too.
      const versions = saved === undefined || principal === null ? [] : laidOver(await saved.inForce(), drafted);
      const everybodysVersions = await publishedNow();
      const whose = `of ${principal ?? 'nobody'}`;
      const theirOwn = await heldWithGenerated(roleMemo.storedLayoutsFor(roles, installed), versions, { replayable, roles }, shell, whose);
      const drawable = theirOwn.heldTo.layouts;
      const theirs = layoutsInUse(versions, { whose, heldTo: drawable });
      // The layout variant of their roles is over what is published: under one, nothing published is loaded.
      const variants = roleMemo.variantsFor(roles);
      const underVariants: LayoutHeldTo = { ...drawable, actionAt: (ref) => (variants.has(actionOfLayoutRef(ref) ?? '') ? undefined : drawable.actionAt(ref)) };
      const everybodys = layoutsInUse(everybodysVersions, { whose: 'published for everybody', heldTo: underVariants, say: memo.sayOnce });
      const laidOverShell = { ...drawableIn(defaults.fragments, kitOf(shell), memo.sayOnce), ...theirOwn.fragments };
      const fragments = Object.keys(laidOverShell).length === 0 ? shell.fragments : { ...shell.fragments, ...laidOverShell };
      const { layouts: ofShell, ...named } = shellWithStoredLayouts(shell);
      const layoutStore = { ...shell.layoutStore, ...ofShell, ...theirOwn.all.layouts, ...everybodys, ...theirs };
      return {
        actions: theirOwn.all.actions,
        ...named,
        slottedCanvases: slottedCanvases(shell.canvases, [...Object.values(layoutStore), ...Object.values(fragments ?? {}).map((fragment) => fragment.layout)]),
        grantedFunctions: grantedFunctionsOf(roles),
        layoutStore,
        ...(fragments !== undefined ? { fragments } : {}),
        entries: entries.byFingerprint(),
        components: components.of(shell),
      };
    },
    sessionArtifacts: (principal, callerOf) => savedArtifacts(sessionDeps(principal, callerOf)),
    draftSavingFor: (shell, principal, callerOf) => draftSaving(sessionDeps(principal, callerOf, shell)),
    // Held to every action in force with the layout it is built with: who holds
    // which is asked when a shell is built for them.
    publishedArtifacts: (saved, publisher) =>
      savedArtifacts({
        whose: 'published for everybody',
        kinds,
        holder: async () => {
          const who = await publisher();
          return { saved, heldTo: async (inForce) => (await heldWithGenerated(actionsWithStoredLayouts(mergedActions(own, sets)), inForce, who)).heldTo };
        },
        defaults: {
          verify: async (versions, inForce) => {
            const kept = inForce.filter((held) => !versions.some((version) => version.kind === held.kind && version.id === held.id));
            const asked: SavedVersion[] = versions.map((version: Written) => ({ ...version, save: '', createdAt: '' }));
            const refusal = refusalOf((await checkedDefaults([...kept, ...asked], defaultsHeldTo(), undefined)).verified, 'publish');
            if (refusal !== undefined) throw new Error(refusal);
          },
        },
        written: () => {
          memo.drop();
          for (const listener of [...listeners]) tell(listener);
          pointer?.bump();
        },
      }),
    readPublished: async () => {
      memo.drop();
      await publishedNow();
    },
    onChangeFor: (listener) => {
      listenersFor.add(listener);
      return () => {
        listenersFor.delete(listener);
      };
    },
    generation: () => pointer?.current() ?? -1,
    stop: () => pointer?.stop(),
  };
};
