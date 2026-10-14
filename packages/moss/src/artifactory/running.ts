import { resolvePrincipal, verifyCharter } from '@niscorp/charter';
import type { ActionDefinition } from '@niscorp/nova';
import type { CacheEntry, SeedEntry, SeedMutation } from '@niscorp/vex';
import { NOBODY_USER_ID } from '../identity';
import { actionOfLayoutRef, candidateOf, entriesOf, entryMisfits, freezeDeep, refusalOf, verifyManifest } from '../manifest';
import type { DraftArtifact, KitComponents, ManifestCandidate, ManifestReport, SessionArtifacts, ShellManifest, ShippedManifest } from '../manifest';
import type { ShellArtifacts } from './artifacts';
import { shellComponents, shellWithStoredLayouts, slottedCanvases } from './artifacts';
import { draftSaving, laidOver } from './draft';
import { answeredRead, readsInForce, seedOf } from './reads';
import type { ReadHeldTo, ReadSources, SavedRead } from './reads';
import { compileEntries, createEntriesInForce } from './entries';
import { createGeneration } from './generation';
import type { Generation, Pointer } from './generation';
import { catalogOfGenerated, generatedInForce } from './generated';
import type { GeneratedHeldTo } from './generated';
import { layoutsInUse } from './layouts';
import type { LayoutHeldTo } from './layouts';
import { actionsWithStoredLayouts, createRoleMemo, narrowedBy } from './roles';
import type { Catalog, CatalogFilter, StoredLayouts } from './roles';
import type { SavedRows, SavedVersion } from './saves';
import { savedArtifacts } from './session';
import type { HeldTo, SavedArtifactsDeps } from './session';

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
  // `saved`: the rows of what is published, with whoever publishes.
  publishedArtifacts: (saved: SavedRows) => SessionArtifacts;
  // Asks the rows what is published, so that a boot that cannot read it fails.
  // One answer serves every shell until this process publishes or the pointer
  // moves: the next shell then asks again.
  readPublished: () => Promise<void>;
  onChangeFor: (listener: (principal: string) => void) => () => void;
  generation: () => number;
  stop: () => void;
};

const mergedActions = (own: Actions, sets: ReadonlyMap<string, Actions>): Actions =>
  Object.freeze([...sets.values()].reduce<Record<string, ActionDefinition>>((all, set) => ({ ...all, ...set }), { ...own }));

const tell = <Told extends unknown[]>(listener: (...told: Told) => void, ...told: Told): void => {
  try {
    listener(...told);
  } catch (error) {
    console.error('[moss:manifest] a listener to a manifest change threw:', error);
  }
};

type SetOwners = {
  claim: (source: string, owner: string, handedOver: boolean) => void;
  ownerRefusalOf: (source: string) => string | undefined;
  assertAppOwned: (source: string) => string;
};

const createSetOwners = (): SetOwners => {
  const owners = new Map<string, string>();
  const ownerRefusalOf = (source: string): string | undefined => {
    const owner = owners.get(source);
    return owner === undefined ? undefined : `the set "${source}" is ${owner}'s, and only its owner replaces it. An app hands a set over under a name of its own.`;
  };
  return {
    ownerRefusalOf,
    claim: (source, owner, handedOver) => {
      const held = owners.get(source);
      if (held !== undefined) throw new Error(`moss: the set "${source}" is ${held}'s, and ${owner} claims it too. A set has one writer.`);
      if (handedOver) throw new Error(`moss: the set "${source}" was handed over by the app, and ${owner} claims it. A set has one writer.`);
      owners.set(source, owner);
    },
    assertAppOwned: (source) => {
      const refusal = ownerRefusalOf(source);
      if (refusal !== undefined) throw new Error(`moss: ${refusal}`);
      return source;
    },
  };
};

const verifiedAtBoot = (candidate: ManifestCandidate): ReturnType<typeof verifyManifest> => {
  const report = verifyManifest(candidate);
  for (const line of report.said) console.error(`[moss] ${line}`);
  const refused = refusalOf(report, 'boot');
  if (refused !== undefined) throw new Error(refused);
  return report;
};

type ComponentNames = ReturnType<typeof shellComponents>;
const createComponentNames = (read: (shell: ShellManifest) => ComponentNames): { of: (shell: ShellManifest) => ComponentNames; drop: () => void } => {
  let components = new WeakMap<ShellManifest, ComponentNames>();
  return {
    of: (shell) => {
      const kept = components.get(shell);
      if (kept !== undefined) return kept;
      const names = read(shell);
      components.set(shell, names);
      return names;
    },
    drop: () => {
      components = new WeakMap();
    },
  };
};

export const createRunningManifest = (config: RunningManifestConfig): RunningManifest => {
  const { shipped } = config;
  const entries = createEntriesInForce(entriesOf(shipped));
  const candidate = (actions: Actions, held = entries.list()): ManifestCandidate => candidateOf(shipped, { actions, entries: held }, config.grants);

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
      actionAt: (ref) => {
        const id = actionOfLayoutRef(ref);
        const action = id !== undefined && Object.hasOwn(actions, id) ? actions[id] : undefined;
        const layout = Object.hasOwn(layouts, ref) ? layouts[ref] : undefined;
        return action === undefined || layout === undefined ? undefined : { ...action, layout };
      },
    };
  };
  const { reads: readSources } = config;
  // The names of the app's functions are known only once a session is: the
  // charter's checks of its `functions` are run at the first shell this process
  // builds, and what they find is said, as the boot cannot refuse it any more.
  let functionsChecked = false;
  const sayFunctionGrants = (names: readonly string[]): void => {
    functionsChecked = true;
    const universes = { actions: Object.keys(inForce), data: config.grants, layouts: Object.keys(shipped.layouts ?? {}) };
    const before = verifyCharter(shipped.charter, universes);
    const known = new Set([...before.errors, ...before.warnings].map((issue) => issue.detail));
    const after = verifyCharter(shipped.charter, { ...universes, functions: names });
    for (const issue of [...after.errors, ...after.warnings]) if (!known.has(issue.detail)) console.warn(`[moss] charter: ${issue.detail}`);
  };
  const grantedFunctionsOf =
    (roles: readonly string[]) =>
    (names: readonly string[]): ReadonlySet<string> => {
      if (!functionsChecked) sayFunctionGrants(names);
      return resolvePrincipal(shipped.charter, names, roles, 'functions');
    };
  const readsHeldTo: ReadHeldTo | undefined =
    readSources === undefined ? undefined : { isAppEntry: (fingerprint) => entries.byFingerprint().has(fingerprint), sources: readSources };
  // What somebody generated and has in force is laid beside what their roles
  // hold: an action of theirs may open either, and a layout of theirs may be for
  // either. `whose`: as a line says it of one that is left out. Absent: nothing is said.
  // `roles`: whose roles the functions a generated action calls are held to. Absent: it may call none.
  const heldWithGenerated = async (held: StoredLayouts, versions: readonly SavedVersion[], who: Partial<Pick<RolesHeld, 'replayable' | 'roles'>>, shell?: ShellManifest, whose?: string) => {
    let replayable: Promise<ReadonlySet<string>> | undefined;
    let catalog: ReturnType<GeneratedHeldTo['catalog']> | undefined;
    const reads = readsHeldTo === undefined ? new Map<string, SavedRead>() : await readsInForce(versions, readsHeldTo, whose);
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
  const sessionDeps = (principal: string | null, callerOf: () => Promise<Caller>, shell?: ShellManifest): SavedArtifactsDeps => ({
    whose: 'of yours',
    kinds: readSources === undefined ? ['layout', 'action', 'fragment'] : ['layout', 'action', 'fragment', 'read'],
    holder:
      principal === null
        ? undefined
        : async () => {
            const caller = await callerOf();
            const held = roleMemo.storedLayoutsFor(caller.roles, caller.installed);
            return { saved: caller.saved, heldTo: async (inForce) => (await heldWithGenerated(held, inForce, caller, shell)).heldTo };
          },
    written: () => {
      if (principal !== null) for (const listener of [...listenersFor]) tell(listener, principal);
    },
  });
  let pointer: Generation | undefined;

  let published: Promise<readonly SavedVersion[]> | undefined;
  // The line of one that is left out is said once for each read of the rows, and not at every shell.
  let saidOfPublished = new Set<string>();
  const dropPublished = (): void => {
    published = undefined;
    saidOfPublished = new Set();
  };
  const publishedNow = (): Promise<readonly SavedVersion[]> => {
    if (published !== undefined) return published;
    const read = (async () => (await config.published?.()) ?? [])();
    published = read;
    // A read that failed is made again by the next shell.
    read.catch(dropPublished);
    return read;
  };
  const sayOnce = (line: string): void => {
    if (saidOfPublished.has(line)) return;
    saidOfPublished.add(line);
    console.error(line);
  };

  const applySets = (arrived: ReadonlyMap<string, Actions>, announce: boolean): void => {
    const next = new Map([...sets, ...arrived]);
    const actions = mergedActions(own, next);
    const verified = verifyManifest(candidate(actions));
    const refusal = refusalOf(verified, 'refresh');
    if (refusal !== undefined) throw new Error(refusal);
    for (const set of arrived.values()) freezeDeep(set);
    sets = next;
    inForce = actions;
    report = verified;
    roleMemo.drop();
    components.drop();
    ofTheApp = undefined;
    for (const listener of [...listeners]) tell(listener);
    if (announce) pointer?.bump();
  };

  // Switches without moving the pointer: answering another process's move with
  // a move would have the processes move each other's for ever.
  const reload = async (): Promise<void> => {
    const read: [string, Actions][] = [];
    for (const [source, load] of loaders) read.push([source, await load()]);
    dropPublished();
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
      const userId = scope?.['userId'];
      // Nothing saved is answered to a caller nobody is signed in for.
      if (shippedEntry !== undefined || readSources === undefined || scope === undefined || typeof userId !== 'string' || userId === NOBODY_USER_ID) return shippedEntry;
      // The newest version is the one in force: a reset writes one with no body.
      const newest = (await readSources.savedOf(scope).history('read', fingerprint))[0];
      if (newest === undefined || newest.body === null || newest.unread !== undefined) return undefined;
      return answeredRead(fingerprint, newest.body);
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
      const whose = `of ${principal ?? 'nobody'}`;
      const theirOwn = await heldWithGenerated(roleMemo.storedLayoutsFor(roles, installed), versions, { replayable, roles }, shell, whose);
      const drawable = theirOwn.heldTo.layouts;
      const theirs = layoutsInUse(versions, { whose, heldTo: drawable });
      // The layout variant of their roles is over what is published: under one, nothing published is loaded.
      const variants = roleMemo.variantsFor(roles);
      const underVariants: LayoutHeldTo = { ...drawable, actionAt: (ref) => (variants.has(actionOfLayoutRef(ref) ?? '') ? undefined : drawable.actionAt(ref)) };
      const everybodys = layoutsInUse(await publishedNow(), { whose: 'published for everybody', heldTo: underVariants, say: sayOnce });
      const fragments = Object.keys(theirOwn.fragments).length === 0 ? shell.fragments : { ...shell.fragments, ...theirOwn.fragments };
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
    publishedArtifacts: (saved) =>
      savedArtifacts({
        whose: 'published for everybody',
        kinds: ['layout'],
        holder: async () => ({ saved, heldTo: async () => (await heldWithGenerated(actionsWithStoredLayouts(inForce), [], {})).heldTo }),
        written: () => {
          dropPublished();
          for (const listener of [...listeners]) tell(listener);
          pointer?.bump();
        },
      }),
    readPublished: async () => {
      dropPublished();
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
