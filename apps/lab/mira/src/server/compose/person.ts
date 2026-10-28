import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { personMe } from '../../app/vex/people.entries';

// Who the model talks with: the name they want to be called, once they gave one, and whether they own this Mira.
export type Person = { name?: string; owner: boolean };

const MeSchema = z.looseObject({ name: z.string().nullable().optional() });

// Read as them through vex, as every message is asked.
export const readPerson = async (session: Pick<FunctionSession, 'wire' | 'roles'>): Promise<Person> => {
  const owner = session.roles.includes('owner');
  const response = await session.wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: personMe.fingerprint, context: {} }) });
  if (!response.ok) return { owner };
  const read: unknown = await response.json();
  const me = MeSchema.safeParse(Array.isArray(read) ? read[0] : read);
  const name = me.success ? (me.data.name ?? '').trim() : '';
  return name === '' ? { owner } : { name, owner };
};
