import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { TALK_DECK, deckGo } from '@lyceum/app/vex/deck.entries';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { setRenderer } from '@lyceum/app/vex/renderer.entries';
import { refusedAll, resetGrants, resetMembers, resetPresses, resetQueries, resetQuestions, resetRefused, resetTimers, resetTurns } from '@lyceum/app/vex/reset.entries';
import type { Timing } from '../timing';
import { vexOver } from '../vex-over';
import { removeVendor } from './integration.functions';

// THE TALK, PUT BACK TO HOW IT STARTS — the controller's Reset
// (speaker/reset.action.ts). Everything a talk leaves behind goes: who joined
// and what they wrote, ran and pressed; everything the speaker gave; the saved
// timers; the names refused; the installed integration. The renderers go back
// to DOM and the deck to its first slide. Every screen is then built again —
// a phone is at the join screen, as nobody.
//
// It is the speaker's own writes over the speaker's own session, one after
// another (app/vex/reset.entries.ts): what the charter lets the speaker
// delete is what a reset can delete, and nothing here reaches the database
// any other way. The order is the tables' — what points at a person goes
// before the person.
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const RefusedSchema = z.array(z.object({ refused_id: z.string() }));
const SURFACES = ['phones', 'stage', 'controller'];

export const resetFunctions = (session: FunctionSession, server: () => MossServer, operatorKey: string, timing: () => Timing): Record<string, FunctionHandler> => ({
  'talk.reset': async () => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker resets the talk.');
    const vex = vexOver(session.wire);
    const members = MembersSchema.parse(await vex(memberRegister.fingerprint)).map((member) => member.member_id);
    const people = [...members, 'speaker'];
    for (const each of [resetPresses, resetQuestions, resetQueries, resetTurns]) await vex(each.fingerprint, { people });
    await vex(resetGrants.fingerprint, { people: members });
    await vex(resetMembers.fingerprint, { people: members });
    await vex(resetTimers.fingerprint, { savedBy: 'speaker' });
    await vex(resetRefused.fingerprint, { refused: RefusedSchema.parse(await vex(refusedAll.fingerprint)).map((row) => row.refused_id) });
    for (const surface of SURFACES) await vex(setRenderer.fingerprint, { surface, renderer: 'dom' });
    await vex(deckGo.fingerprint, { deck: TALK_DECK, position: 0 });
    await removeVendor(server(), operatorKey);
    // The saved timers are gone from the table; unload them from tide too.
    await timing().reload();
    // Everybody is somebody else now: nobody, mostly. Their identity is read
    // again and their shell built again — the ones on a screen right now, and
    // the ones who are not.
    for (const member of members) server().invalidateIdentity(member);
    for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
    return { done: true, people: members.length };
  },
});
