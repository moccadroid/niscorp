import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import type { ShellManifest } from './app';
import { shellComponents } from './components';
import type { PgPool, SeedEntry, SeedMutation } from '@niscorp/vex';
import { createGeneration } from './generation';
import type { Generation } from './generation';
import { freezeDeep } from './handover';
import { createRoleHoldings } from './roles';
import type { Catalog, InstalledOnly } from './roles';
import { candidateOf, refusalOf, verifyManifest } from './verify';
import type { ManifestCandidate, ManifestReport, ShippedManifest } from './verify';

// ═══════════════════════════════════════════════════════════════
// THE RUNNING MANIFEST — what the app consists of right now, with one writer.
//
// An app ships actions, and more arrive while it runs: an approved
// integration's, read from rows; an app's own, loaded from its tables. Each
// arrives as a NAMED SET, laid over what was shipped. The actions in force are
// what was shipped, then each set.
//
// A change is ONE MOVE, made here and nowhere else: build the candidate, verify
// it (./verify.ts), and only if it may be served switch to it — drop what was
// derived from the old one, tell whoever listens, move the pointer the other
// processes poll. A candidate that is refused throws, and nothing was touched.
//
// One place, because every place that assigns the actions is a place that can
// leave them as nobody verified them. And verified first, because trying a set
// by serving it means taking it out again while requests are being answered.
//
// What the app shipped does not change: its manifest was frozen when it was
// handed over (./handover.ts). A set is frozen the same way when it is taken,
// so what is in force is what was verified, and stays it.
// ═══════════════════════════════════════════════════════════════

type Actions = Readonly<Record<string, ActionDefinition>>;

// How a set that lives in rows is read.
export type ActionLoader = () => Promise<Record<string, ActionDefinition>>;

export type RunningManifestConfig = {
  // WHAT THE APP SHIPPED: the seven fields of its manifest a verification
  // reads. Read and never written. A server hands over the app's own record,
  // which the hand-over has frozen.
  shipped: ShippedManifest;
  // every `<table>.<verb>` the database can carry: the universe the charter's
  // `data` section is verified over
  grants: readonly string[];
  // Which of a set of roles' actions are there for an install list. A function,
  // because this module does not know what an integration is (./roles.ts).
  // Absent: every granted action is there, whatever is installed, until
  // somebody says otherwise (`narrowCatalogs`).
  installedOnly?: InstalledOnly;
  // The named sets that live in rows, each with how it is read again when
  // another process says something changed. A set with no loader is whatever
  // it was last replaced with.
  loaders?: Readonly<Record<string, ActionLoader>>;
  // The generation pointer (./generation.ts): where it is kept and how often
  // it is read, once `watch` is called. Absent: this manifest tells no other
  // process that it changed, and hears from none.
  pointer?: { pool: PgPool; everyMs?: number };
};

export type RunningManifest = {
  // The actions in force now: what the app shipped, then each named set.
  actions: () => Actions;
  // An entry the app serves, by its fingerprint.
  entries: ReadonlyMap<string, SeedEntry | SeedMutation>;
  // Would the app serve THESE actions, everything else as it stands? Nothing
  // is switched: this is how a bundle is tried before any of it is written.
  verify: (actions: Actions) => ManifestReport;
  // Would the app be served with `actions` in place of the set called `source`,
  // everything else as it stands? What `replace` would be told, and nothing
  // is switched: the set that is in force stays in force.
  verifyReplace: (source: string, actions: Record<string, ActionDefinition>) => ManifestReport;
  // The report the manifest in force was verified by.
  report: () => ManifestReport;
  // Put `actions` in place of the set called `source` (a set that was not there
  // arrives; an action the set no longer names leaves). Throws, with the
  // sentence `refresh` throws, when the app could not be served that way.
  // Taken, the set is frozen where it stands, as the manifest was: what is in
  // force is not edited, it is replaced.
  replace: (source: string, actions: Record<string, ActionDefinition>) => void;
  // Something derived from the manifest went stale where this module cannot
  // see (a role moved, an install landed): verify what is in force again, drop
  // what was derived from it and tell whoever listens.
  refresh: () => void;
  // START TELLING THE OTHER PROCESSES, AND HEARING THEM. From here on a switch
  // moves the pointer; and a move another process made is answered by reading
  // every set that has a loader and switching WITHOUT moving it again — or
  // every process would move every other process's, for ever. Its own call,
  // because a server that refuses to boot must leave no timer behind, and
  // because what a process does while it starts is no news to the others.
  watch: () => void;
  // Told once each time the manifest is switched, after what was derived from
  // the old one is dropped. Returns the way to stop being told.
  onChange: (listener: () => void) => () => void;
  // A SET THAT LIVES IN ROWS, NAMED AFTER THE MANIFEST STANDS: how it is read
  // again when another process says something changed. What the config's
  // `loaders` say, said later, by whoever starts once the manifest is there (a
  // feature). The set takes its place among the sets when it is named, empty
  // until it is replaced, so nothing is switched and nobody is told.
  loadFrom: (source: string, load: ActionLoader) => void;
  // ONE MORE RULE FOR WHICH GRANTED ACTIONS ARE THERE FOR AN INSTALL LIST, laid
  // after the ones already said. What was remembered for each set of roles is
  // dropped, so the next answer is made with it.
  narrowCatalogs: (filter: InstalledOnly) => void;
  // What a set of roles holds, remembered until the next switch (./roles.ts).
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  variantsFor: (roles: readonly string[]) => ReadonlyMap<string, LayoutNode>;
  // The action definitions a set of roles holds, by id: granted, there for the
  // install list, each with the layout variant those roles hold in its place
  // (./roles.ts). Remembered like the two above.
  definitionsFor: (roles: readonly string[], installed: readonly string[] | undefined) => Readonly<Record<string, ActionDefinition>>;
  // Every component name a shell's trees may mention, with the contract
  // declared for each (./components.ts): read off the actions in force and
  // the shell manifest it is asked for, and remembered for that manifest
  // until the next switch.
  componentsFor: (shell: ShellManifest) => ReturnType<typeof shellComponents>;
  // The generation this process has seen; -1 until it watches and has read it.
  generation: () => number;
  // Stop watching.
  stop: () => void;
};

const laidOver = (own: Actions, sets: ReadonlyMap<string, Actions>): Actions =>
  Object.freeze([...sets.values()].reduce<Record<string, ActionDefinition>>((all, set) => ({ ...all, ...set }), { ...own }));

// A listener that throws must not stop the others being told, nor undo a
// switch that has already happened.
const tell = (listener: () => void): void => {
  try {
    listener();
  } catch (error) {
    console.error('[moss:manifest] a listener to a manifest change threw:', error);
  }
};

export const createRunningManifest = (config: RunningManifestConfig): RunningManifest => {
  const { shipped } = config;
  const candidate = (actions: Actions): ManifestCandidate => candidateOf(shipped, actions, config.grants);

  // What the app ships, and the named sets in the order they are laid over it.
  // A set with a loader has its place from the start, so the order does not
  // depend on which change happened to come first.
  const own: Actions = shipped.actions;
  const loaders = new Map(Object.entries(config.loaders ?? {}));
  let sets: ReadonlyMap<string, Actions> = new Map([...loaders.keys()].map((source) => [source, {}]));
  let inForce = laidOver(own, sets);

  // REFUSE TO START INCOHERENT. What is only said is said first, here and at no
  // later switch: a boot is when somebody reads the log.
  let report = verifyManifest(candidate(inForce));
  for (const line of report.said) console.error(`[moss] ${line}`);
  const refused = refusalOf(report, 'boot');
  if (refused !== undefined) throw new Error(refused);

  // The rules for what is there for an install list, each applied to what the
  // one before it kept.
  const narrowings: InstalledOnly[] = config.installedOnly === undefined ? [] : [config.installedOnly];
  const holdings = createRoleHoldings({
    manifest: () => ({ charter: shipped.charter, actions: inForce, layouts: shipped.layouts }),
    installedOnly: (ids, installed) => narrowings.reduce((kept, narrow) => narrow(kept, installed), ids),
  });
  // Kept by the shell manifest asked for: the app's own and each page's are
  // objects that live as long as the app does.
  let components = new WeakMap<ShellManifest, ReturnType<typeof shellComponents>>();
  const listeners = new Set<() => void>();
  let pointer: Generation | undefined;

  // THE ONE MOVE: the sets that `arrived`, laid into the sets as they are now
  // (one of a name that is there takes its place; a new one goes last). The
  // check comes before the first assignment, so a candidate that is refused
  // leaves every piece as it was, the caller's own record included.
  const take = (arrived: ReadonlyMap<string, Actions>, move: boolean): void => {
    const next = new Map([...sets, ...arrived]);
    const actions = laidOver(own, next);
    const verified = verifyManifest(candidate(actions));
    const refusal = refusalOf(verified, 'refresh');
    if (refusal !== undefined) throw new Error(refusal);
    // Taken: what arrived is part of the manifest now, and nobody's to write.
    for (const set of arrived.values()) freezeDeep(set);
    sets = next;
    inForce = actions;
    report = verified;
    holdings.drop();
    components = new WeakMap();
    for (const listener of [...listeners]) tell(listener);
    if (move) pointer?.bump();
  };

  // What this process does about a change somebody else already announced.
  const reload = async (): Promise<void> => {
    const read: [string, Actions][] = [];
    for (const [source, load] of loaders) read.push([source, await load()]);
    take(new Map(read), false);
  };

  return {
    actions: () => inForce,
    entries: new Map((shipped.entries ?? []).map((entry) => [entry.fingerprint, entry])),
    verify: (actions) => verifyManifest(candidate(actions)),
    verifyReplace: (source, actions) => verifyManifest(candidate(laidOver(own, new Map(sets).set(source, actions)))),
    report: () => report,
    replace: (source, actions) => take(new Map([[source, actions]]), true),
    refresh: () => take(new Map(), true),
    watch: () => {
      const where = config.pointer;
      if (pointer !== undefined || where === undefined) return;
      pointer = createGeneration(where.pool, { onMoved: reload, ...(where.everyMs === undefined ? {} : { everyMs: where.everyMs }) });
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    loadFrom: (source, load) => {
      loaders.set(source, load);
      if (!sets.has(source)) sets = new Map([...sets, [source, {}]]);
    },
    narrowCatalogs: (filter) => {
      narrowings.push(filter);
      holdings.drop();
    },
    catalogFor: holdings.catalogFor,
    variantsFor: holdings.variantsFor,
    definitionsFor: holdings.definitionsFor,
    componentsFor: (shell) => {
      const kept = components.get(shell);
      if (kept !== undefined) return kept;
      const read = shellComponents({ actions: inForce, layouts: shipped.layouts }, shell);
      components.set(shell, read);
      return read;
    },
    generation: () => pointer?.current() ?? -1,
    stop: () => pointer?.stop(),
  };
};
