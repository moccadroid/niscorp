import { randomUUID } from 'node:crypto';
import { isRecord } from '@niscorp/nova/reflect';
import { z } from 'zod';
import type { ArtifactKind, ArtifactVersion, SessionArtifacts } from '../manifest';
import { generatedId, readAction, readFragment } from './generated';
import type { GeneratedHeldTo } from './generated';
import { isInUse, readLayout, refOf } from './layouts';
import type { LayoutHeldTo } from './layouts';
import { readSaved, readWritten } from './reads';
import type { ReadHeldTo } from './reads';
import type { SavedRows, SavedVersion } from './saves';

// `reads`: absent where no read is saved.
export type HeldTo = { layouts: LayoutHeldTo; generated: GeneratedHeldTo; reads?: ReadHeldTo };

// Whose rows the calls read and write, and what a save of theirs is held to
// beside what is in force for them: a layout may be for an action they generated.
export type Holder = { saved: SavedRows; heldTo: (inForce: readonly SavedVersion[]) => Promise<HeldTo> };

export type SavedArtifactsDeps = {
  // Absent: nobody is signed in.
  holder: (() => Promise<Holder>) | undefined;
  // Whose an artifact is, as a refusal says it: "of yours".
  whose: string;
  kinds: readonly ArtifactKind[];
  written: () => void;
};

const SaveIdSchema = z.uuid();

const ToSaveSchema = z.array(z.strictObject({ kind: z.string(), id: z.string().optional(), body: z.unknown() })).min(1);

export type Written = Pick<SavedVersion, 'kind' | 'id' | 'body' | 'copiedFrom'>;

// A read keeps the fingerprint vex gave it, and is named by it.
const NEW_ID: Readonly<Record<ArtifactKind, () => string>> = {
  layout: randomUUID,
  action: generatedId,
  fragment: generatedId,
  read: () => {
    throw new Error('moss: a read is saved under the fingerprint vex gave it: name it as the id.');
  },
};

const listed = (version: SavedVersion, kind: ArtifactKind): ArtifactVersion => ({
  kind,
  id: version.id,
  save: version.save,
  createdAt: version.createdAt,
  copiedFrom: version.copiedFrom,
  body: version.body,
});

export const withoutMark = ({ use: _mark, ...layout }: Record<string, unknown>): Record<string, unknown> => layout;

export const checked = async (kind: ArtifactKind, id: string, body: unknown, heldTo: HeldTo): Promise<unknown> => {
  if (kind === 'layout') {
    const read = readLayout(body, heldTo.layouts);
    if ('refusal' in read) throw new Error(`moss: the layout for "${refOf(body) ?? '(no ref)'}" is refused: ${read.refusal}`);
    return read.layout;
  }
  // Asked for, a read is taken from what vex wrote; restored or kept in a draft, it is the body that was taken.
  if (kind === 'read') {
    const read = heldTo.reads === undefined ? { refusal: 'no read is saved here' } : body === undefined ? await readWritten(id, heldTo.reads) : await readSaved(body, id, heldTo.reads);
    if ('refusal' in read) throw new Error(`moss: the read "${id}" is refused: ${read.refusal}`);
    return read.body;
  }
  const read = await (kind === 'action' ? readAction : readFragment)(body, id, heldTo.generated);
  if ('refusal' in read) throw new Error(`moss: the ${kind} is refused: ${read.refusal}`);
  return read.body;
};

export const markedRefs = (versions: readonly Pick<Written, 'kind' | 'body'>[]): string[] => {
  const marked = versions.flatMap((version) => {
    const ref = refOf(version.body);
    return version.kind === 'layout' && isRecord(version.body) && version.body['use'] === true && ref !== undefined ? [ref] : [];
  });
  const twice = marked.find((ref, at) => marked.indexOf(ref) !== at);
  if (twice !== undefined) throw new Error(`moss: two layouts of one save are marked in use for "${twice}". One is in use at a time.`);
  return marked;
};

// A save that says which layout is in use for a ref, by marking one or by taking
// the one in use out (a reset, or a save of it without the mark), takes the mark
// off the holder's others for that ref. Two saves at the same moment can each
// leave theirs marked, and without this the one left would be drawn in place
// of the one that was taken out.
const unmarked = (versions: readonly Written[], inForce: readonly SavedVersion[]): Written[] => {
  const layouts = versions.filter((version) => version.kind === 'layout');
  const marked = markedRefs(layouts);
  const saved = new Set(layouts.map((version) => version.id));
  const takenOut = inForce.flatMap((held) => (isInUse(held) && saved.has(held.id) ? [refOf(held.body)] : []));
  const decided = new Set([...marked, ...takenOut]);
  return inForce.flatMap((held): Written[] => {
    const ref = refOf(held.body);
    // One that could not be read stays as it is stored: written again, it would carry this server's stamp over another grammar.
    if (!isInUse(held) || held.unread !== undefined || !isRecord(held.body) || ref === undefined || !decided.has(ref) || saved.has(held.id)) return [];
    return [{ kind: 'layout', id: held.id, body: withoutMark(held.body), copiedFrom: held.save }];
  });
};

export const idsOf = (versions: readonly (Written & { kind: ArtifactKind })[]): { kind: ArtifactKind; id: string }[] => versions.map(({ kind, id }) => ({ kind, id }));

// `nobody`: what is said where nobody is signed in.
export const savingFor = ({ holder, whose, kinds, written }: SavedArtifactsDeps, nobody: string) => {
  // Everybody nobody is signed in for shares one `userId`: what one of them saved would be all of theirs.
  const requireHolder = (): (() => Promise<Holder>) => {
    if (holder === undefined) throw new Error(nobody);
    return holder;
  };

  const ofKind = (kind: unknown): ArtifactKind => {
    const known = kinds.find((one) => one === kind);
    if (known === undefined) throw new Error(`moss: "${String(kind)}" is not a kind that is saved. The kinds: ${kinds.join(', ')}.`);
    return known;
  };

  const askedOf = (artifacts: unknown): { kind: ArtifactKind; id?: string | undefined; body: unknown }[] => {
    const asked = ToSaveSchema.safeParse(artifacts);
    if (!asked.success) throw new Error('moss: a save holds one or several artifacts, each `{ kind, id?, body }` and nothing else.');
    return asked.data.map((artifact) => ({ ...artifact, kind: ofKind(artifact.kind) }));
  };

  // Each under its id, and checked. `inForce`: what an id that was named has to be among.
  const checkedEach = async (asked: ReturnType<typeof askedOf>, inForce: readonly SavedVersion[], held: HeldTo): Promise<(Written & { kind: ArtifactKind })[]> => {
    const versions: (Written & { kind: ArtifactKind })[] = [];
    for (const { kind, id: named, body } of asked) {
      const id = named ?? NEW_ID[kind]();
      if (kind === 'read' && body !== undefined) throw new Error(`moss: the read "${id}" is refused: it is what vex wrote for the request. Leave the body out.`);
      versions.push({ kind, id, body: await checked(kind, id, body, held), copiedFrom: null });
    }
    const notTheirs = asked.find(({ kind, id }) => id !== undefined && kind !== 'read' && !inForce.some((version) => version.kind === kind && version.id === id));
    if (notTheirs !== undefined) {
      throw new Error(`moss: there is no ${notTheirs.kind} "${notTheirs.id}" ${whose}. Leave the id out, and moss gives a new ${notTheirs.kind} its id.`);
    }
    const twice = versions.find((version, at) => versions.findIndex((other) => other.kind === version.kind && other.id === version.id) !== at);
    if (twice !== undefined) throw new Error(`moss: the ${twice.kind} "${twice.id}" is in one save twice.`);
    return versions;
  };

  const write = async (saved: SavedRows, versions: readonly Written[], inForce: readonly SavedVersion[]): Promise<string> => {
    const save = randomUUID();
    await saved.write({ id: save, versions: [...versions, ...unmarked(versions, inForce)] });
    written();
    return save;
  };

  return { requireHolder, ofKind, askedOf, checkedEach, write };
};

export const savedArtifacts = (deps: SavedArtifactsDeps): SessionArtifacts => {
  const { holder, whose, kinds } = deps;
  const { requireHolder, ofKind, askedOf, checkedEach, write } = savingFor(deps, 'moss: nobody is signed in to this session, and a save is somebody’s.');

  return {
    save: async (artifacts) => {
      const holderOf = requireHolder();
      const asked = askedOf(artifacts);
      const { saved, heldTo } = await holderOf();
      const inForce = await saved.inForce();
      const versions = await checkedEach(asked, inForce, await heldTo(inForce));
      return { save: await write(saved, versions, inForce), artifacts: idsOf(versions) };
    },

    list: async (kind) => {
      const only = kind === undefined ? undefined : ofKind(kind);
      if (holder === undefined) return [];
      const inForce = await (await holder()).saved.inForce();
      return inForce.flatMap((version) => {
        const known = kinds.find((one) => one === version.kind);
        return version.body !== null && known !== undefined && (only === undefined || known === only) ? [listed(version, known)] : [];
      });
    },

    history: async (kind, id) => {
      const known = ofKind(kind);
      if (holder === undefined) return [];
      return (await (await holder()).saved.history(known, id)).map((version) => listed(version, known));
    },

    restore: async (kind, id, save) => {
      const holderOf = requireHolder();
      const known = ofKind(kind);
      const { saved, heldTo } = await holderOf();
      // A save is a uuid, and the column refuses to be compared with anything else.
      const version = SaveIdSchema.safeParse(save).success ? (await saved.history(known, id, save))[0] : undefined;
      if (version === undefined) throw new Error(`moss: no ${known} "${id}" ${whose} was saved in "${save}".`);
      if (version.unread !== undefined) throw new Error(`moss: the ${known} "${id}" saved in "${save}" cannot be read: ${version.unread}`);
      const inForce = await saved.inForce();
      const body = version.body === null ? null : await checked(known, id, version.body, await heldTo(inForce));
      return { save: await write(saved, [{ kind: known, id, body, copiedFrom: version.save }], inForce) };
    },

    reset: async (kind, id) => {
      const holderOf = requireHolder();
      const known = ofKind(kind);
      const { saved } = await holderOf();
      const inForce = await saved.inForce();
      if (!inForce.some((version) => version.kind === known && version.id === id && version.body !== null)) throw new Error(`moss: no ${known} "${id}" ${whose} is in force.`);
      return { save: await write(saved, [{ kind: known, id, body: null, copiedFrom: null }], inForce) };
    },
  };
};
