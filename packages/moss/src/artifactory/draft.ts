import { isRecord } from '@niscorp/nova/reflect';
import type { ArtifactKind, DraftArtifact } from '../manifest';
import { refOf } from './layouts';
import type { SavedVersion } from './saves';
import { checked, idsOf, markedRefs, savingFor, withoutMark } from './session';
import type { SavedArtifactsDeps, Written } from './session';

// A drafted layout marked in use is drawn in place of a saved one marked for the same ref: of two, the later counts.
const LATER_THAN_ANY_SAVE = '9999-12-31T23:59:59.999Z';

// What is in a draft is over what was saved: a drafted artifact stands in for the saved one under its id.
export const laidOver = (inForce: readonly SavedVersion[], drafted: readonly DraftArtifact[] = []): readonly SavedVersion[] =>
  drafted.length === 0
    ? inForce
    : [
        ...inForce.filter((version) => !drafted.some((one) => one.kind === version.kind && one.id === version.id)),
        ...drafted.map((one): SavedVersion => ({ ...one, save: 'draft', copiedFrom: null, createdAt: LATER_THAN_ANY_SAVE })),
      ];

// A shell keeps its draft. What is added to one is checked here, and a draft is saved here, by what a session's save is made of.
export const draftSaving = (deps: SavedArtifactsDeps) => {
  const { requireHolder, ofKind, askedOf, checkedEach, write } = savingFor(deps, 'moss: nobody is signed in to this session, and a draft is somebody’s to save.');
  return {
    // The draft with these added to it. Each is checked beside what is in force for its holder with the draft laid over.
    add: async (artifacts: unknown, drafted: readonly DraftArtifact[]): Promise<{ drafted: DraftArtifact[]; added: { kind: ArtifactKind; id: string }[] }> => {
      const holderOf = requireHolder();
      const asked = askedOf(artifacts);
      const { saved, heldTo } = await holderOf();
      const inForce = laidOver(await saved.inForce(), drafted);
      const versions = await checkedEach(asked, inForce, await heldTo(inForce));
      const added = versions.map(({ kind, id, body }): DraftArtifact => ({ kind, id, body }));
      // As a save does: marking one in use for a ref takes the mark off the others for it.
      const marked = new Set(markedRefs(added));
      const kept = drafted.flatMap((one): DraftArtifact[] => {
        if (added.some((other) => other.kind === one.kind && other.id === one.id)) return [];
        const ref = refOf(one.body);
        const loses = one.kind === 'layout' && isRecord(one.body) && one.body['use'] === true && ref !== undefined && marked.has(ref);
        return [loses && isRecord(one.body) ? { ...one, body: withoutMark(one.body) } : one];
      });
      return { drafted: [...kept, ...added], added: idsOf(versions) };
    },

    save: async (drafted: readonly DraftArtifact[]): Promise<{ save: string; artifacts: { kind: ArtifactKind; id: string }[] }> => {
      const holderOf = requireHolder();
      if (drafted.length === 0) throw new Error('moss: the draft holds nothing to save.');
      const { saved, heldTo } = await holderOf();
      const inForce = await saved.inForce();
      const held = await heldTo(laidOver(inForce, drafted));
      const versions: (Written & { kind: ArtifactKind })[] = [];
      for (const one of drafted) {
        const kind = ofKind(one.kind);
        versions.push({ kind, id: one.id, body: await checked(kind, one.id, one.body, held), copiedFrom: null });
      }
      return { save: await write(saved, versions, inForce), artifacts: idsOf(versions) };
    },
  };
};
