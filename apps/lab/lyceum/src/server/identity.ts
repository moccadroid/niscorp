import { z } from 'zod';
import type { IdentityRecord, NiscApp } from '@niscorp/moss';
import { identityEverybody, identityGrants, identityMember } from '@lyceum/app/vex/member.entries';

const MemberRowSchema = z.object({ member_id: z.string() }).nullable();
const GrantRowsSchema = z.array(z.object({ role: z.string() }));

const ANONYMOUS: IdentityRecord = { roles: ['public'], scope: {} };

export const lyceumIdentity: NonNullable<NiscApp['identity']> = {
  as: 'identity',
  resolve: async (principal, read) => {
    const scope = { userId: principal };
    const member = MemberRowSchema.parse(await read(identityMember.fingerprint, scope));
    const grants = GrantRowsSchema.parse((await read(identityGrants.fingerprint, scope)) ?? []);

    // Read only for a member: the speaker and the stage are not the audience.
    const everybody = member === null ? [] : GrantRowsSchema.parse((await read(identityEverybody.fingerprint, scope)) ?? []);
    const roles = [...new Set([...(member === null ? [] : ['member']), ...grants.map((grant) => grant.role), ...everybody.map((grant) => grant.role)])];
    // `fitToShow` is what the stage's reach compares a verdict against: a
    // constant, stamped here so no request can say it.
    return roles.length === 0 ? ANONYMOUS : { roles, scope: { fitToShow: true } };
  },
};
