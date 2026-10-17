import type { ActionDefinition, ActionFragment } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { layoutMisfits, verifyManifest } from '../manifest';
import type { KitComponents, ManifestCandidate, ManifestReport } from '../manifest';
import { catalogOfGenerated, generatedInForce } from './generated';
import type { Generated, GeneratedHeldTo } from './generated';
import { readsInForce, seedOf } from './reads';
import type { ReadHeldTo, SavedRead } from './reads';
import type { SavedVersion } from './saves';

type Actions = Readonly<Record<string, ActionDefinition>>;

// What is published for everybody and passes: laid over the build's copies and the sets handed over.
export type Defaults = { actions: Actions; fragments: Readonly<Record<string, ActionFragment>>; reads: ReadonlyMap<string, SavedRead> };

export const NO_DEFAULTS: Defaults = { actions: {}, fragments: {}, reads: new Map() };

// What one shell can draw of the fragments published for everybody; it is told of one it cannot.
export const drawableIn = (fragments: Readonly<Record<string, ActionFragment>>, kit: KitComponents, say: (line: string) => void): Readonly<Record<string, ActionFragment>> =>
  Object.fromEntries(
    Object.entries(fragments).filter(([id, fragment]) => {
      const misfits = layoutMisfits(fragment.layout, kit);
      if (misfits.length > 0) say(`[moss] the fragment "${id}" published for everybody is left out of a shell that cannot draw it: ${misfits.join('; ')}`);
      return misfits.length === 0;
    }),
  );

// One read of the rows answers every shell until it is dropped, and what it says
// of one that is left out is said once for each read, not at every shell.
export const createPublishedMemo = (): {
  held: () => Promise<readonly SavedVersion[]> | undefined;
  keep: (read: Promise<readonly SavedVersion[]>) => void;
  drop: () => void;
  sayOnce: (line: string) => void;
} => {
  let read: Promise<readonly SavedVersion[]> | undefined;
  let said = new Set<string>();
  return {
    held: () => read,
    keep: (promise) => {
      read = promise;
    },
    drop: () => {
      read = undefined;
      said = new Set();
    },
    sayOnce: (line) => {
      if (said.has(line)) return;
      said.add(line);
      console.error(line);
    },
  };
};

export const hasDefaults = (defaults: Defaults): boolean =>
  Object.keys(defaults.actions).length > 0 || Object.keys(defaults.fragments).length > 0 || defaults.reads.size > 0;

export type DefaultsHeldTo = {
  kit: KitComponents;
  entryOf: (fingerprint: string) => SeedEntry | SeedMutation | undefined;
  fingerprints: () => Iterable<string>;
  reads: ReadHeldTo | undefined;
  // The actions in force with nothing published laid over them.
  built: Actions;
  candidate: (actions: Actions, fragments: Readonly<Record<string, ActionFragment>>) => ManifestCandidate;
};

// What is published is checked as a person's generated artifacts are, and then as
// a manifest. Whose policy a replay is under is the viewer's, at the replay, and
// whose grants a call needs is every holder's: the manifest check reads them.
export const checkedDefaults = async (
  versions: readonly SavedVersion[],
  heldTo: DefaultsHeldTo,
  whose: string | undefined,
): Promise<{ passed: Generated; reads: ReadonlyMap<string, SavedRead>; verified: ManifestReport }> => {
  const reads = heldTo.reads === undefined ? new Map<string, SavedRead>() : await readsInForce(versions, heldTo.reads, whose);
  const checks: GeneratedHeldTo = {
    kit: heldTo.kit,
    entryOf: (fingerprint) => {
      const read = reads.get(fingerprint);
      return heldTo.entryOf(fingerprint) ?? (read === undefined ? undefined : seedOf(fingerprint, read));
    },
    replayable: async () => new Set([...heldTo.fingerprints(), ...reads.keys()]),
    mayCall: () => true,
    catalog: () => [...Object.values(heldTo.built).map((action) => ({ id: action.id, input: action.input ?? {} })), ...catalogOfGenerated(versions)],
  };
  const passed = await generatedInForce(versions, checks, whose);
  return { passed, reads, verified: verifyManifest(heldTo.candidate({ ...heldTo.built, ...passed.actions }, passed.fragments)) };
};
