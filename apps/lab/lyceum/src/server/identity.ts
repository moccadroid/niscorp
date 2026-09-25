import { z } from 'zod';
import type { IdentityRecord, NiscApp } from '@niscorp/moss';
import { identityGrants, identityMember } from '@lyceum/app/vex/member.entries';

// WHO SOMEBODY IS IN THE ROOM, read from rows — so the sorting, or any grant
// the speaker makes on stage, changes a person by writing a row. No raw SQL:
// both reads are seeded entries moss executes as the `identity` charter role,
// pinned to the principal by the engine-side `userId`.
//
// A person with a member row wears their house (or `unsorted`), plus any
// capability roles granted to them. The speaker and the stage have no member
// row and wear only their grants. Anybody else is the anonymous principal.

const MemberRowSchema = z.object({ house_id: z.string().nullable() }).nullable();
const GrantRowsSchema = z.array(z.object({ role: z.string() }));

const ANONYMOUS: IdentityRecord = { roles: ['public'], scope: {} };

export const lyceumIdentity: NonNullable<NiscApp['identity']> = {
  as: 'identity',
  resolve: async (principal, read) => {
    const scope = { userId: principal };
    const member = MemberRowSchema.parse(await read(identityMember.fingerprint, scope));
    const grants = GrantRowsSchema.parse((await read(identityGrants.fingerprint, scope)) ?? []);

    const roles = [...(member === null ? [] : [member.house_id ?? 'unsorted']), ...grants.map((grant) => grant.role)];
    return roles.length === 0 ? ANONYMOUS : { roles, scope: {} };
  },
};
