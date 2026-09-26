import { memberRename } from '@lyceum/app/vex/member.entries';

// The new name, for your own row. `memberId` bounds the statement; the engine's
// personal reach is what makes it yours, whatever this says.
export const renamePrism = {
  fingerprint: memberRename.fingerprint,
  context: { memberId: { $ref: '$.me.member_id' }, name: { $ref: '$.draft' } },
};
