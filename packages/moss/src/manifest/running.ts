import type { ActionDefinition } from '@niscorp/nova';
import type { ShellManifest } from './app';
import type { ShellArtifacts } from './artifacts';
import { shellComponents } from './components';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { entriesOf } from './entries';
import { createGeneration } from './generation';
import type { Generation, Pointer } from './generation';
import { freezeDeep } from './handover';
import { createRoleHoldings, narrowedBy } from './roles';
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
  // Held to narrowing, like one added later. Absent: every granted action is
  // there, whatever is installed, until somebody says otherwise
  // (`addCatalogFilter`).
  installedOnly?: InstalledOnly;
  // The generation pointer (./generation.ts): how its row is read and moved,
  // and how often it is read, once `watch` is called. Absent: this manifest
  // tells no other process that it changed, and hears from none.
  pointer?: Pointer & { everyMs?: number };
};

// A SET OF ACTIONS THAT HAS AN OWNER, as its owner holds it: the two ways the
// set is written, and nobody else has either.
export type OwnedActions = {
  // Put `actions` in place of the set, as `RunningManifest.replace` does for a
  // set of the app's. Throws, and changes nothing, when the app could not be
  // served that way.
  replace: (actions: Record<string, ActionDefinition>) => void;
  // THE SET LIVES IN ROWS: how it is read again when another process says
  // something changed. It is what carries a set to the other processes of a
  // deployment: a set with no loader is whatever THIS process last replaced it
  // with, and no other process is handed it or can read it. The set takes its
  // place among the sets when this is said, empty until it is replaced, so
  // nothing is switched and nobody is told.
  setLoader: (load: ActionLoader) => void;
};

export type RunningManifest = {
  // The actions in force now: what the app shipped, then each named set.
  actions: () => Actions;
  // THE ENTRIES THE APP SERVES, in the order it shipped them. They are held
  // here and nowhere else while a server runs: whoever seeds them where vex
  // replays from is handed this list, a verification reads it, and a shell is
  // handed them by fingerprint with the rest of what it is made of
  // (`artifactsFor`).
  entries: () => readonly (SeedEntry | SeedMutation)[];
  // Would the app serve THESE actions, everything else as it stands? Nothing
  // is switched: this is how a bundle is tried before any of it is written.
  verify: (actions: Actions) => ManifestReport;
  // Would the app be served with `actions` in place of the set called `source`,
  // everything else as it stands? What `replace` would be told, and nothing
  // is switched: the set that is in force stays in force. ALWAYS A REPORT. A
  // set that has an owner is not the caller's to hand over, and `replace`
  // throws for it; asked whether it would be taken, that is the first error of
  // the answer (`check: 'owner'`, with the sentence `replace` throws), and
  // the candidate is verified like any other. It threw, so the one question
  // whose answer is "no" had to be caught to be heard.
  verifyReplace: (source: string, actions: Record<string, ActionDefinition>) => ManifestReport;
  // The report the manifest in force was verified by.
  report: () => ManifestReport;
  // Put `actions` in place of the set called `source` (a set that was not there
  // arrives; an action the set no longer names leaves). Throws, with the
  // sentence `refresh` throws, when the app could not be served that way.
  // Taken, the set is frozen where it stands, as the manifest was: what is in
  // force is not edited, it is replaced. Taken HERE: the pointer this moves
  // tells the other processes that something changed, and each reads again
  // the sets it has a loader for. A set with none is in no other process.
  // FOR A SET OF THE APP'S: one that has an owner (`claim`) is its owner's to
  // replace, and this throws, saying whose it is.
  replace: (source: string, actions: Record<string, ActionDefinition>) => void;
  // ONE WRITER FOR A SET. Whoever keeps a set of its own (a feature, started
  // once the manifest stands) claims it by name, once, and is handed the two
  // ways it is written. From then on `replace` refuses that name,
  // `verifyReplace` answers that it would, and a second claim of it throws: two writers of one set leave it as
  // whichever wrote last, and nobody verified that. `owner` is how a refusal
  // names the claimant (`the feature "integrations"`).
  claim: (source: string, owner: string) => OwnedActions;
  // Something derived from the manifest went stale where this module cannot
  // see (a role moved, an install landed): verify what is in force again, drop
  // what was derived from it and tell whoever listens.
  refresh: () => void;
  // START TELLING THE OTHER PROCESSES, AND HEARING THEM. From here on a switch
  // moves the pointer; and a move another process made is answered by reading
  // every set that has a loader and switching WITHOUT moving it again — or
  // every process would move every other process's, for ever. WHAT IS TOLD IS
  // THAT SOMETHING CHANGED, NEVER WHAT: a set reaches another process only by
  // that process reading it, so only a set with a loader does. Its own call,
  // because a server that refuses to boot must leave no timer behind, and
  // because what a process does while it starts is no news to the others.
  watch: () => void;
  // Told once each time the manifest is switched, after what was derived from
  // the old one is dropped. Returns the way to stop being told.
  onChange: (listener: () => void) => () => void;
  // ONE MORE RULE FOR WHICH GRANTED ACTIONS ARE THERE FOR AN INSTALL LIST, laid
  // after the ones already said. It takes ids out and puts none in: what it
  // answers is kept where it was handed it, and nowhere else. What was
  // remembered for each set of roles is dropped, so the next answer is made
  // with it.
  addCatalogFilter: (filter: InstalledOnly) => void;
  // The ids of the actions a set of roles holds, with their version token,
  // remembered until the next switch (./roles.ts).
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  // WHAT A SHELL IS MADE OF, FOR A SET OF ROLES (./artifacts.ts): the action
  // definitions they hold, each with the layout variant those roles hold of it
  // in its place; the shell's canvases, its frame and its layout store; its
  // fragments; the entries; and every component name all of that may mention.
  // `shell` is a shell manifest the app handed over, its own or a page's.
  //
  // THE ONE QUESTION A SHELL ASKS OF WHAT EXISTS: once to be built, and once
  // more each time it adopts. An action, a layout, a fragment and an entry
  // reach a shell through this answer and through nothing else, so whatever
  // comes to decide what an id resolves to decides it here. The definitions
  // are remembered for each set of roles and the component names for each
  // shell manifest, both until the next switch.
  artifactsFor: (shell: ShellManifest, roles: readonly string[], installed: readonly string[] | undefined) => ShellArtifacts;
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

// WHOSE EACH CLAIMED SET IS, as a refusal names its owner.
type SetOwners = {
  claim: (source: string, owner: string, handedOver: boolean) => void;
  // Why a set of this name is not the app's to hand over, or undefined when
  // it is: the sentence a refusal says, without who says it.
  notTheApps: (source: string) => string | undefined;
  appSource: (source: string) => string;
};

const createSetOwners = (): SetOwners => {
  const owners = new Map<string, string>();
  const notTheApps = (source: string): string | undefined => {
    const owner = owners.get(source);
    return owner === undefined ? undefined : `the set of actions "${source}" is ${owner}'s, and only its owner replaces it. An app hands a set over under a name of its own.`;
  };
  return {
    notTheApps,
    // `handedOver`: the app already handed a set over under that name.
    claim: (source, owner, handedOver) => {
      const held = owners.get(source);
      if (held !== undefined) throw new Error(`moss: the set of actions "${source}" is ${held}'s, and ${owner} claims it too. A set of actions has one writer.`);
      if (handedOver) throw new Error(`moss: the set of actions "${source}" was handed over by the app, and ${owner} claims it. A set of actions has one writer.`);
      owners.set(source, owner);
    },
    // The name, where it names a set of the app's. A set that has an owner is
    // not the app's to hand over: this throws.
    appSource: (source) => {
      const refusal = notTheApps(source);
      if (refusal !== undefined) throw new Error(`moss: ${refusal}`);
      return source;
    },
  };
};

// REFUSE TO START INCOHERENT. What is only said is said first, here and at no
// later switch: a boot is when somebody reads the log.
const verifiedAtBoot = (candidate: ManifestCandidate): ReturnType<typeof verifyManifest> => {
  const report = verifyManifest(candidate);
  for (const line of report.said) console.error(`[moss] ${line}`);
  const refused = refusalOf(report, 'boot');
  if (refused !== undefined) throw new Error(refused);
  return report;
};

// THE COMPONENT NAMES A SHELL MAY MENTION, kept by the shell manifest asked
// for: the app's own and each page's are objects that live as long as the app
// does. `read` reads them off what is in force; `drop` forgets what was kept,
// for when that changes.
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
  // THE ENTRIES THE APP SERVES, read off what it shipped once (./entries.ts)
  // and held here: a verification is handed these, and so is whoever looks one
  // up. Nothing else reads them off the app while it runs.
  const entries = entriesOf(shipped);
  const candidate = (actions: Actions): ManifestCandidate => candidateOf(shipped, { actions, entries }, config.grants);

  // What the app ships, and the named sets in the order they are laid over it.
  // A set has its place from when its loader is named, so the order does not
  // depend on which change happened to come first.
  const own: Actions = shipped.actions;
  const loaders = new Map<string, ActionLoader>();
  const owners = createSetOwners();
  let sets: ReadonlyMap<string, Actions> = new Map();
  let inForce = laidOver(own, sets);

  let report = verifiedAtBoot(candidate(inForce));

  // The rules for what is there for an install list, each applied to what the
  // one before it kept, and each held to narrowing it (./roles.ts,
  // `narrowedBy`): none of them can put an id there.
  const narrowings: InstalledOnly[] = config.installedOnly === undefined ? [] : [config.installedOnly];
  const holdings = createRoleHoldings({
    manifest: () => ({ charter: shipped.charter, actions: inForce, layouts: shipped.layouts }),
    installedOnly: (ids, installed) => narrowings.reduce((kept, narrow) => narrowedBy(narrow, kept, installed), ids),
  });
  const components = createComponentNames((shell) => shellComponents({ actions: inForce, layouts: shipped.layouts }, shell));
  const byFingerprint: ShellArtifacts['entries'] = new Map(entries.map((entry) => [entry.fingerprint, entry]));
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
    components.drop();
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
    entries: () => entries,
    verify: (actions) => verifyManifest(candidate(actions)),
    verifyReplace: (source, actions) => {
      const verified = verifyManifest(candidate(laidOver(own, new Map(sets).set(source, actions))));
      const refusal = owners.notTheApps(source);
      return refusal === undefined ? verified : { ...verified, errors: [{ check: 'owner', detail: refusal }, ...verified.errors] };
    },
    report: () => report,
    replace: (source, actions) => take(new Map([[owners.appSource(source), actions]]), true),
    claim: (source, owner) => {
      owners.claim(source, owner, sets.has(source));
      return {
        replace: (actions) => take(new Map([[source, actions]]), true),
        setLoader: (load) => {
          loaders.set(source, load);
          if (!sets.has(source)) sets = new Map([...sets, [source, {}]]);
        },
      };
    },
    refresh: () => take(new Map(), true),
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
      narrowings.push(filter);
      holdings.drop();
    },
    catalogFor: holdings.catalogFor,
    artifactsFor: (shell, roles, installed) => ({
      actions: holdings.definitionsFor(roles, installed),
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
