import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import type { PgPool, SeedEntry, SeedMutation } from '@niscorp/vex';
import { createGeneration } from './generation';
import type { Generation } from './generation';
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
// ═══════════════════════════════════════════════════════════════

type Actions = Readonly<Record<string, ActionDefinition>>;

export type RunningManifestConfig = {
  // WHAT THE APP SHIPPED, as the app holds it. The record itself and not a copy
  // of its values, for two reasons that the next phase removes together:
  //
  //   - an app may still edit its manifest and call `refresh`, so the charter,
  //     the variants, the role combinations and the behaviors are read as they
  //     stand at each verification;
  //   - code that predates this module reads `app.actions` and expects the
  //     integrations' actions in it, so `actions` is also WRITTEN (see `switchTo`).
  //
  // The entries are read once: they are seeded when the server boots, so one
  // that arrives later was never served.
  shipped: ShippedManifest;
  // every `<table>.<verb>` the database can carry: the universe the charter's
  // `data` section is verified over
  grants: readonly string[];
  // Which of a set of roles' actions are there for an install list. A function,
  // because this module does not know what an integration is (./roles.ts).
  installedOnly: InstalledOnly;
  // The named sets that live in rows, each with how it is read again when
  // another process says something changed. A set with no loader is whatever
  // it was last replaced with.
  loaders?: Readonly<Record<string, () => Promise<Record<string, ActionDefinition>>>>;
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
  // The report the manifest in force was verified by.
  report: () => ManifestReport;
  // Put `actions` in place of the set called `source` (a set that was not there
  // arrives; an action the set no longer names leaves). Throws, with the
  // sentence `refresh` throws, when the app could not be served that way.
  replace: (source: string, actions: Record<string, ActionDefinition>) => void;
  // Something the manifest is verified against, or something derived from it,
  // changed where this module cannot see: verify what is in force again and
  // switch to it.
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
  // What a set of roles holds, remembered until the next switch (./roles.ts).
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  variantsFor: (roles: readonly string[]) => ReadonlyMap<string, LayoutNode>;
  // The generation this process has seen; -1 until it watches and has read it.
  generation: () => number;
  // Stop watching.
  stop: () => void;
};

const sameActions = (a: Actions, b: Actions): boolean => {
  const ids = Object.keys(a);
  return ids.length === Object.keys(b).length && ids.every((id) => a[id] === b[id]);
};

const laidOver = (own: Actions, sets: ReadonlyMap<string, Actions>): Actions =>
  Object.freeze([...sets.values()].reduce<Record<string, ActionDefinition>>((all, set) => ({ ...all, ...set }), { ...own }));

// WHAT THE APP SHIPS, after an edit the app made to its own record.
//
// `seen` is what that record held when this module last read or wrote it, so
// the difference is the app's doing and nothing else's: an id it added or
// changed is shipped, an id it took out is not. What a named set put there is
// the set's, and stays until the set is replaced.
const shippedNow = (own: Actions, seen: Actions, held: Actions): Actions => {
  if (sameActions(held, seen)) return own;
  const kept = Object.entries(own).filter(([id]) => Object.hasOwn(held, id));
  const edited = Object.entries(held).filter(([id, definition]) => seen[id] !== definition);
  return Object.fromEntries([...kept, ...edited]);
};

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
  const served = shipped.entries ?? [];
  const candidate = (actions: Actions): ManifestCandidate => candidateOf({ ...shipped, entries: served }, actions, config.grants);

  // What the app ships, and the named sets in the order they are laid over it.
  // A set with a loader has its place from the start, so the order does not
  // depend on which change happened to come first.
  let own: Actions = { ...shipped.actions };
  let sets: ReadonlyMap<string, Actions> = new Map(Object.keys(config.loaders ?? {}).map((source) => [source, {}]));
  let inForce = laidOver(own, sets);
  let seen = inForce;

  // REFUSE TO START INCOHERENT. What is only said is said first, here and at no
  // later switch: a boot is when somebody reads the log.
  let report = verifyManifest(candidate(inForce));
  for (const line of report.said) console.error(`[moss] ${line}`);
  const refused = refusalOf(report, 'boot');
  if (refused !== undefined) throw new Error(refused);

  const holdings = createRoleHoldings({
    manifest: () => ({ charter: shipped.charter, actions: inForce, layouts: shipped.layouts }),
    installedOnly: config.installedOnly,
  });
  const listeners = new Set<() => void>();
  let pointer: Generation | undefined;

  // THE ONE MOVE. The check comes before the first assignment, so a candidate
  // that is refused leaves every piece as it was.
  const switchTo = (next: { own: Actions; sets: ReadonlyMap<string, Actions> }, move: boolean): void => {
    const actions = laidOver(next.own, next.sets);
    const verified = verifyManifest(candidate(actions));
    const refusal = refusalOf(verified, 'refresh');
    if (refusal !== undefined) throw new Error(refusal);
    own = next.own;
    sets = next.sets;
    inForce = actions;
    report = verified;
    holdings.drop();
    // THE ONE REMAINING WRITER OF `app.actions`. Some exported functions and
    // some apps still read that field and expect the actions in force in it, so
    // it is kept equal to them — a copy, because the app may still edit its own
    // record, and only when it differs, so an app with no named set keeps the
    // record it handed over. The next phase removes this.
    if (!sameActions(shipped.actions, inForce)) shipped.actions = { ...inForce };
    seen = inForce;
    for (const listener of [...listeners]) tell(listener);
    if (move) pointer?.bump();
  };

  // What this process does about a change somebody else already announced.
  const reload = async (): Promise<void> => {
    const read: [string, Actions][] = [];
    for (const [source, load] of Object.entries(config.loaders ?? {})) read.push([source, await load()]);
    // Laid into the sets as they are NOW, not as they were before the reads.
    switchTo({ own, sets: new Map([...sets, ...read]) }, false);
  };

  return {
    actions: () => inForce,
    entries: new Map(served.map((entry) => [entry.fingerprint, entry])),
    verify: (actions) => verifyManifest(candidate(actions)),
    report: () => report,
    replace: (source, actions) => switchTo({ own, sets: new Map(sets).set(source, { ...actions }) }, true),
    // An app may have edited its own record before saying so; what it holds
    // now is what it ships.
    refresh: () => switchTo({ own: shippedNow(own, seen, shipped.actions), sets }, true),
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
    catalogFor: holdings.catalogFor,
    variantsFor: holdings.variantsFor,
    generation: () => pointer?.current() ?? -1,
    stop: () => pointer?.stop(),
  };
};
