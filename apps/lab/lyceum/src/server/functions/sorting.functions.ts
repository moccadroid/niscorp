import { z } from 'zod';
import type { MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { houseSizes, housesAll, memberSort, membersUnsorted } from '@lyceum/app/vex/member.entries';

// THE SORTING. Every unsorted person, in the order they joined, is placed in a
// house — and the placement IS their new role: one write as the `hat`, then
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

export const sortingFunctions = (server: () => MossServer): Record<string, FunctionHandler> => ({
  'speaker.sort': async () => {
    const hat = server();
    const houses = await rows(HousesSchema, hat.executeAs('hat', housesAll.fingerprint, {}));
    const unsorted = await rows(UnsortedSchema, hat.executeAs('hat', membersUnsorted.fingerprint, {}));
    const counted = await rows(SizesSchema, hat.executeAs('hat', houseSizes.fingerprint, {}));
    const sizes = new Map(counted.map((row) => [row.house_id, row.size]));

    const placed: { memberId: string; houseId: string }[] = [];
    for (const { member_id: memberId } of unsorted) {
      const houseId = emptiest(houses, sizes);
      const written = await hat.executeAs('hat', memberSort.fingerprint, { memberId, houseId });
      if (written === undefined) throw new Error(`The hat could not place ${memberId}.`);
      sizes.set(houseId, (sizes.get(houseId) ?? 0) + 1);
      hat.invalidateIdentity(memberId);
      placed.push({ memberId, houseId });
    }
    return { placed };
  },
});
