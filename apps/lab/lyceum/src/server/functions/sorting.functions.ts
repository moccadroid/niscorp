import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { houseSizes, housesAll, memberSort, memberUnsort, membersSorted, membersUnsorted } from '@lyceum/app/vex/member.entries';
import { vexOver } from '../vex-over';

// THE SORTING. Every unsorted person, in the order they joined, is placed in a
// house — and the placement IS their new role: one write, AS THE SPEAKER over
// the speaker's own session (their charter grants `members.write.update`), then
// `invalidateIdentity`, which forgets who they were and rebuilds their live
// shell from the new row, carrying their open connection across. Their phone
// receives its house without anybody signing in again.
//
// Which house: the one with the fewest members so far, ties broken by the
// houses' standing order. This is the hat with no model behind it — the
// fallback that keeps the room balanced when Jev is not there. Jev replaces
// the CHOICE (PLAN.md, the sorting); the write and the re-role stay as they
// are.

const HousesSchema = z.array(z.object({ house_id: z.string(), name: z.string() }));
const UnsortedSchema = z.array(z.object({ member_id: z.string() }));
const SizesSchema = z.array(z.object({ house_id: z.string(), size: z.number() }));

const rows = async <T>(schema: z.ZodType<T>, read: Promise<unknown>): Promise<T> => schema.parse((await read) ?? []);

const emptiest = (houses: readonly { house_id: string }[], sizes: ReadonlyMap<string, number>): string => {
  const [first, ...rest] = houses;
  if (first === undefined) throw new Error('There are no houses to sort into.');
  return rest.reduce((best, house) => ((sizes.get(house.house_id) ?? 0) < (sizes.get(best) ?? 0) ? house.house_id : best), first.house_id);
};

export const sortingFunctions = (session: FunctionSession, server: () => MossServer): Record<string, FunctionHandler> => {
  const vex = vexOver(session.wire);
  return {
  'speaker.sort': async () => {
    const houses = await rows(HousesSchema, vex(housesAll.fingerprint));
    const unsorted = await rows(UnsortedSchema, vex(membersUnsorted.fingerprint));
    const counted = await rows(SizesSchema, vex(houseSizes.fingerprint));
    const sizes = new Map(counted.map((row) => [row.house_id, row.size]));

    const placed: { memberId: string; houseId: string }[] = [];
    for (const { member_id: memberId } of unsorted) {
      const houseId = emptiest(houses, sizes);
      await vex(memberSort.fingerprint, { memberId, houseId });
      sizes.set(houseId, (sizes.get(houseId) ?? 0) + 1);
      server().invalidateIdentity(memberId);
      placed.push({ memberId, houseId });
    }
    return { placed };
  },

  // UNSORTING — for testing: everybody back out of their house, re-roled the
  // same way the sorting re-roles them, so every open phone loses its house
  // where it stands. The room stays; the sorting can run again.
  'speaker.unsort': async () => {
    const sorted = await rows(UnsortedSchema, vex(membersSorted.fingerprint));
    for (const { member_id: memberId } of sorted) {
      await vex(memberUnsort.fingerprint, { memberId });
      server().invalidateIdentity(memberId);
    }
    return { unsorted: sorted.length };
  },
  };
};
