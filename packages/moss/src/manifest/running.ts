import type { ActionDefinition } from '@niscorp/nova';
import type { ShellManifest } from './app';
import type { ShellArtifacts } from './artifacts';
import { entriesOf, shellComponents } from './artifacts';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { createGeneration } from './generation';
import type { Generation, Pointer } from './generation';
import { freezeDeep } from './schema';
import { createRoleMemo, narrowedBy } from './roles';
import type { Catalog, CatalogFilter } from './roles';
import { candidateOf, refusalOf, verifyManifest } from './verify';
import type { ManifestCandidate, ManifestReport, ShippedManifest } from './verify';

type Actions = Readonly<Record<string, ActionDefinition>>;

export type ActionLoader = () => Promise<Record<string, ActionDefinition>>;

export type RunningManifestConfig = {
  shipped: ShippedManifest;
  grants: readonly string[];
  installedOnly?: CatalogFilter;
  pointer?: Pointer & { everyMs?: number };
};

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
  claim: (source: string, owner: string) => OwnedActions;
  refresh: () => void;
  watch: () => void;
  onChange: (listener: () => void) => () => void;
  addCatalogFilter: (filter: CatalogFilter) => void;
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  artifactsFor: (shell: ShellManifest, roles: readonly string[], installed: readonly string[] | undefined) => ShellArtifacts;
  generation: () => number;
  stop: () => void;
};

const mergedActions = (own: Actions, sets: ReadonlyMap<string, Actions>): Actions =>
  Object.freeze([...sets.values()].reduce<Record<string, ActionDefinition>>((all, set) => ({ ...all, ...set }), { ...own }));

const tell = (listener: () => void): void => {
  try {
    listener();
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
    return owner === undefined ? undefined : `the set of actions "${source}" is ${owner}'s, and only its owner replaces it. An app hands a set over under a name of its own.`;
  };
  return {
    ownerRefusalOf,
    claim: (source, owner, handedOver) => {
      const held = owners.get(source);
      if (held !== undefined) throw new Error(`moss: the set of actions "${source}" is ${held}'s, and ${owner} claims it too. A set of actions has one writer.`);
      if (handedOver) throw new Error(`moss: the set of actions "${source}" was handed over by the app, and ${owner} claims it. A set of actions has one writer.`);
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
  const entries = entriesOf(shipped);
  const candidate = (actions: Actions): ManifestCandidate => candidateOf(shipped, { actions, entries }, config.grants);

  const own: Actions = shipped.actions;
  const loaders = new Map<string, ActionLoader>();
  const owners = createSetOwners();
  let sets: ReadonlyMap<string, Actions> = new Map();
  let inForce = mergedActions(own, sets);

  let report = verifiedAtBoot(candidate(inForce));

  const catalogFilters: CatalogFilter[] = config.installedOnly === undefined ? [] : [config.installedOnly];
  const roleMemo = createRoleMemo({
    manifest: () => ({ charter: shipped.charter, actions: inForce, layouts: shipped.layouts }),
    installedOnly: (ids, installed) => catalogFilters.reduce((kept, narrow) => narrowedBy(narrow, kept, installed), ids),
  });
  const components = createComponentNames((shell) => shellComponents({ actions: inForce, layouts: shipped.layouts }, shell));
  const byFingerprint: ShellArtifacts['entries'] = new Map(entries.map((entry) => [entry.fingerprint, entry]));
  const listeners = new Set<() => void>();
  let pointer: Generation | undefined;

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
    for (const listener of [...listeners]) tell(listener);
    if (announce) pointer?.bump();
  };

  // Switches without moving the pointer: answering another process's move with
  // a move would have the processes move each other's for ever.
  const reload = async (): Promise<void> => {
    const read: [string, Actions][] = [];
    for (const [source, load] of loaders) read.push([source, await load()]);
    applySets(new Map(read), false);
  };

  return {
    actions: () => inForce,
    entries: () => entries,
    verify: (actions) => verifyManifest(candidate(actions)),
    report: () => report,
    replace: (source, actions) => applySets(new Map([[owners.assertAppOwned(source), actions]]), true),
    claim: (source, owner) => {
      owners.claim(source, owner, sets.has(source));
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
    artifactsFor: (shell, roles, installed) => ({
      actions: roleMemo.definitionsFor(roles, installed),
      canvases: shell.canvases,
      ...(shell.layout !== undefined ? { frame: shell.layout } : {}),
      ...(shell.layoutStore !== undefined ? { layoutStore: shell.layoutStore } : {}),
      ...(shell.fragments !== undefined ? { fragments: shell.fragments } : {}),
      entries: byFingerprint,
      components: components.of(shell),
    }),
    generation: () => pointer?.current() ?? -1,
    stop: () => pointer?.stop(),
  };
};
