import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { buttonHolders } from '@lyceum/app/vex/grant.entries';
import { vexOver } from '../vex-over';

// WHO GETS THE BUTTON — chance, which is the one thing here that cannot be
// data. Everything else about the button is: this reads who joined and who
// already has it (as the speaker, over the speaker's own session) and answers
// some of the rest; the controller's tool writes their grant rows.
//
// A QUARTER of the room each press, and never fewer than three — so a press
// finds somebody with their phone out — picked from the people whose phone is
// connected right now, when anybody's is. Press again and another quarter of
// the rest get it.
const SHARE = 0.25;
const AT_LEAST = 3;
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const HoldersSchema = z.array(z.object({ principal: z.string() }));

export const buttonFunctions = (session: FunctionSession, server: () => MossServer): Record<string, FunctionHandler> => ({
  'button.pick': async () => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker gives the button.');
    const vex = vexOver(session.wire);
    const has = new Set(HoldersSchema.parse(await vex(buttonHolders.fingerprint)).map((row) => row.principal));
    const members = MembersSchema.parse(await vex(memberRegister.fingerprint));
    const rest = members.filter((member) => !has.has(member.member_id));
    // The ones looking at their phone now, if there are any: a shell with a
    // connection. Nobody connected (a check, a room that locked its phones):
    // anybody.
    const connected = new Set((server().shells?.list() ?? []).filter((shell) => shell.connections > 0).map((shell) => shell.principal));
    const here = rest.filter((member) => connected.has(member.member_id));
    const without = here.length > 0 ? here : rest;
    for (let i = without.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const here = without[i];
      const there = without[j];
      if (here !== undefined && there !== undefined) {
        without[i] = there;
        without[j] = here;
      }
    }
    return without.slice(0, Math.max(AT_LEAST, Math.ceil(members.length * SHARE))).map((member) => ({ member_id: member.member_id }));
  },
});
