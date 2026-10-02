import { z } from 'zod';
import type { IdentityRecord, NiscApp } from '@niscorp/moss';
import { identityEverybody, identityGrants, identityMember } from '@lyceum/app/vex/member.entries';

// WHO SOMEBODY IS IN THE ROOM, read from rows — so the assignment, or any grant
// the speaker makes on stage, changes a person by writing a row. No raw SQL:
// both reads are seeded entries moss executes as the `identity` charter role,
// pinned to the principal by the engine-side `userId`.
//
// A person with a member row is a `member`, plus any roles granted to them,
// plus the roles given to everybody (one `everybody` row each — so joining
// late changes nothing). The speaker and the stage have no member
// row and wear only their grants. Anybody else is the anonymous principal.

const MemberRowSchema = z.object({ member_id: z.string() }).nullable();
const GrantRowsSchema = z.array(z.object({ role: z.string() }));

const ANONYMOUS: IdentityRecord = { roles: ['public'], scope: {} };

export const lyceumIdentity: NonNullable<NiscApp['identity']> = {
  as: 'identity',
  resolve: async (principal, read) => {
    const scope = { userId: principal };
    const member = MemberRowSchema.parse(await read(identityMember.fingerprint, scope));
    const grants = GrantRowsSchema.parse((await read(identityGrants.fingerprint, scope)) ?? []);

    // What everybody was given is a member's too, whenever they joined — read
    // only for a member: the speaker and the stage are not the audience.
    const everybody = member === null ? [] : GrantRowsSchema.parse((await read(identityEverybody.fingerprint, scope)) ?? []);
    const roles = [...new Set([...(member === null ? [] : ['member']), ...grants.map((grant) => grant.role), ...everybody.map((grant) => grant.role)])];
    // `fitToShow`: what the stage's reach compares a verdict against
    // (app/vex/behaviors.ts) — a constant, stamped here so no request can say it.
    return roles.length === 0 ? ANONYMOUS : { roles, scope: { fitToShow: true } };
  },
};
