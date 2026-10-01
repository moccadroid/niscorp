import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { buttonHolders } from '@lyceum/app/vex/grant.entries';
import { vexOver } from '../vex-over';

// WHICH THREE GET THE BUTTON — chance, which is the one thing here that
// cannot be data. Everything else about the button is: this reads who joined
// and who already has it (as the speaker, over the speaker's own session) and
// answers three of the rest; the controller's tool writes their grant rows.
const HOW_MANY = 3;
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const HoldersSchema = z.array(z.object({ principal: z.string() }));

export const buttonFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'button.pick': async () => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker gives the button.');
    const vex = vexOver(session.wire);
    const has = new Set(HoldersSchema.parse(await vex(buttonHolders.fingerprint)).map((row) => row.principal));
    const without = MembersSchema.parse(await vex(memberRegister.fingerprint)).filter((member) => !has.has(member.member_id));
    for (let i = without.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const here = without[i];
      const there = without[j];
      if (here !== undefined && there !== undefined) {
        without[i] = there;
        without[j] = here;
      }
    }
    return without.slice(0, Math.max(0, HOW_MANY - has.size)).map((member) => ({ member_id: member.member_id }));
  },
});
