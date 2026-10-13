import { randomUUID } from 'node:crypto';
import { isRecord } from '@niscorp/nova/reflect';
import { z } from 'zod';
import type { ArtifactKind, ArtifactVersion, SessionArtifacts } from '../manifest';
import { isInUse, readLayout, refOf } from './layouts';
import type { LayoutHeldTo, SavedLayout } from './layouts';
import type { SavedRows, SavedVersion } from './saves';

// Whose rows the calls read and write, and what a layout of theirs is held to.
export type Holder = { saved: SavedRows; heldTo: LayoutHeldTo };

export type SavedArtifactsDeps = {
  // Absent: nobody is signed in.
  holder: (() => Promise<Holder>) | undefined;
  // Whose a layout is, as a refusal says it: "of yours".
  whose: string;
  written: () => void;
};

const KINDS: readonly string[] = ['layout'] satisfies readonly ArtifactKind[];

const SaveIdSchema = z.uuid();

const ToSaveSchema = z.array(z.strictObject({ kind: z.string(), id: z.string().optional(), body: z.unknown() })).min(1);

type Checked = { id: string; body: SavedLayout | null; copiedFrom: string | null };

type Written = Pick<SavedVersion, 'id' | 'body' | 'copiedFrom'>;

const listed = (version: SavedVersion): ArtifactVersion => ({
  kind: 'layout',
  id: version.id,
  save: version.save,
  createdAt: version.createdAt,
  copiedFrom: version.copiedFrom,
  body: version.body,
});

const withoutMark = ({ use: _mark, ...layout }: Record<string, unknown>): Record<string, unknown> => layout;

const ofKind = (kind: unknown): void => {
  if (typeof kind !== 'string' || !KINDS.includes(kind)) throw new Error(`moss: "${String(kind)}" is not a kind that is saved. The kinds: ${KINDS.join(', ')}.`);
};

const checked = (body: unknown, held: LayoutHeldTo): SavedLayout => {
  const read = readLayout(body, held);
  if ('refusal' in read) throw new Error(`moss: the layout for "${refOf(body) ?? '(no ref)'}" is refused: ${read.refusal}`);
  return read.layout;
};

// A save that says which layout is in use for a ref, by marking one or by taking
// the one in use out (a reset, or a save of it without the mark), takes the mark
// off the holder's others for that ref. Two saves at the same moment can each
// leave theirs marked, and without this the one left would be drawn in place
// of the one that was taken out.
const unmarked = (versions: readonly Checked[], inForce: readonly SavedVersion[]): Written[] => {
  const marked = versions.flatMap((version) => (version.body?.use === true ? [version.body.ref] : []));
  const twice = marked.find((ref, at) => marked.indexOf(ref) !== at);
  if (twice !== undefined) throw new Error(`moss: two layouts of one save are marked in use for "${twice}". One is in use at a time.`);
  const saved = new Set(versions.map((version) => version.id));
  const takenOut = inForce.flatMap((held) => (isInUse(held) && saved.has(held.id) ? [refOf(held.body)] : []));
  const decided = new Set([...marked, ...takenOut]);
  return inForce.flatMap((held): Written[] => {
    const ref = refOf(held.body);
    // One that could not be read stays as it is stored: written again, it would carry this server's stamp over another grammar.
    if (!isInUse(held) || held.unread !== undefined || !isRecord(held.body) || ref === undefined || !decided.has(ref) || saved.has(held.id)) return [];
    return [{ id: held.id, body: withoutMark(held.body), copiedFrom: held.save }];
  });
};

export const savedArtifacts = ({ holder, whose, written }: SavedArtifactsDeps): SessionArtifacts => {
  // Everybody nobody is signed in for shares one `userId`: what one of them saved would be all of theirs.
  const requireHolder = (): (() => Promise<Holder>) => {
    if (holder === undefined) throw new Error('moss: nobody is signed in to this session, and a save is somebody’s.');
    return holder;
  };

  const write = async (saved: SavedRows, versions: readonly Checked[], inForce: readonly SavedVersion[]): Promise<string> => {
    const twice = versions.find((version, at) => versions.findIndex((other) => other.id === version.id) !== at);
    if (twice !== undefined) throw new Error(`moss: the layout "${twice.id}" is in one save twice.`);
    const save = randomUUID();
    const held: readonly Written[] = [...versions, ...unmarked(versions, inForce)];
    await saved.write({ id: save, versions: held.map((version) => ({ kind: 'layout', ...version })) });
    written();
    return save;
  };

  return {
    save: async (artifacts) => {
      const holderOf = requireHolder();
      const toSave = ToSaveSchema.safeParse(artifacts);
      if (!toSave.success) throw new Error('moss: a save holds one or several artifacts, each `{ kind, id?, body }` and nothing else.');
      for (const artifact of toSave.data) ofKind(artifact.kind);
      const { saved, heldTo } = await holderOf();
      const layouts = toSave.data.map((artifact) => ({ id: artifact.id, body: checked(artifact.body, heldTo) }));
      const inForce = (await saved.inForce()).filter((version) => version.kind === 'layout');
      const theirs = new Set(inForce.map((version) => version.id));
      for (const { id } of layouts) {
        if (id !== undefined && !theirs.has(id)) throw new Error(`moss: there is no layout "${id}" ${whose}. Leave the id out, and moss gives a new layout its id.`);
      }
      const versions = layouts.map(({ id, body }) => ({ id: id ?? randomUUID(), body, copiedFrom: null }));
      return { save: await write(saved, versions, inForce), artifacts: versions.map(({ id }) => ({ kind: 'layout', id })) };
    },

    list: async (kind) => {
      if (kind !== undefined) ofKind(kind);
      if (holder === undefined) return [];
      const inForce = await (await holder()).saved.inForce();
      return inForce.filter((version) => version.body !== null && KINDS.includes(version.kind) && (kind === undefined || version.kind === kind)).map(listed);
    },

    history: async (kind, id) => {
      ofKind(kind);
      if (holder === undefined) return [];
      return (await (await holder()).saved.history(kind, id)).map(listed);
    },

    restore: async (kind, id, save) => {
      const holderOf = requireHolder();
      ofKind(kind);
      const { saved, heldTo } = await holderOf();
      // A save is a uuid, and the column refuses to be compared with anything else.
      const version = SaveIdSchema.safeParse(save).success ? (await saved.history(kind, id, save))[0] : undefined;
      if (version === undefined) throw new Error(`moss: no layout "${id}" ${whose} was saved in "${save}".`);
      if (version.unread !== undefined) throw new Error(`moss: the layout "${id}" saved in "${save}" cannot be read: ${version.unread}`);
      const body = version.body === null ? null : checked(version.body, heldTo);
      const inForce = (await saved.inForce()).filter((held) => held.kind === kind);
      return { save: await write(saved, [{ id, body, copiedFrom: version.save }], inForce) };
    },

    reset: async (kind, id) => {
      const holderOf = requireHolder();
      ofKind(kind);
      const { saved } = await holderOf();
      const inForce = (await saved.inForce()).filter((version) => version.kind === kind);
      if (!inForce.some((version) => version.id === id && version.body !== null)) throw new Error(`moss: no layout "${id}" ${whose} is in force.`);
      return { save: await write(saved, [{ id, body: null, copiedFrom: null }], inForce) };
    },
  };
};
