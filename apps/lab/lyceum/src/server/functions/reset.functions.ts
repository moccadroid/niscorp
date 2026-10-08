import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { TALK_DECK, deckGo, deckTalk, talksAll } from '@lyceum/app/vex/deck.entries';
import { EVERYBODY } from '@lyceum/app/vex/grant.entries';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { questionsEvery } from '@lyceum/app/vex/question.entries';
import { queriesTally } from '@lyceum/app/vex/query.entries';
import { timersSaved } from '@lyceum/app/vex/timer.entries';
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

// SWITCHING TALKS IS A RESET — the other talk starts with an empty room, as
// this one did (speaker/talks.action.ts). With nothing to lose it is only the
// deck moving. With something — people joined, queries run, questions sent,
// timers saved — it is refused until the speaker says they are sure, and the
// refusal says what would go. `picked` and `sure` are the talks sheet's data.
const SwitchSchema = z.object({ picked: z.string().min(1), sure: z.boolean().default(false) });
const TalksSchema = z.array(z.object({ talk_id: z.string(), title: z.string() }));
const TallySchema = z.object({ replayed: z.number(), generated: z.number(), refused: z.number() });
const counted = (count: number, one: string, many: string): string[] => (count === 0 ? [] : [`${count} ${count === 1 ? one : many}`]);

export const resetFunctions = (session: FunctionSession, server: () => MossServer, operatorKey: string, timing: () => Timing): Record<string, FunctionHandler> => {
  const reset = resetWith(session, server, operatorKey, timing);
  return {
    'talk.switch': async (input) => {
      if (session.principal !== 'speaker') throw new Error('Only the speaker switches talks.');
      const { picked, sure } = SwitchSchema.parse(input);
      const vex = vexOver(session.wire);
      const to = TalksSchema.parse(await vex(talksAll.fingerprint)).find((talk) => talk.talk_id === picked);
      if (to === undefined) throw new Error('There is no such talk.');
      const on = z.object({ talk_id: z.string() }).parse(await vex(deckTalk.fingerprint));
      const tally = TallySchema.parse(await vex(queriesTally.fingerprint));
      const left = [
        ...counted(MembersSchema.parse(await vex(memberRegister.fingerprint)).length, 'person has joined', 'people have joined'),
        ...counted(tally.replayed + tally.generated + tally.refused, 'query was run', 'queries were run'),
        ...counted(z.array(z.unknown()).parse(await vex(questionsEvery.fingerprint)).length, 'question was sent', 'questions were sent'),
        ...counted(z.array(z.unknown()).parse(await vex(timersSaved.fingerprint)).length, 'timer is saved', 'timers are saved'),
      ];
      // The talk that is on, or a room with nothing in it: only the deck moves.
      if (to.talk_id === on.talk_id || left.length === 0) {
        await vex(deckGo.fingerprint, { deck: TALK_DECK, talk: to.talk_id, position: 0 });
        return { switched: true, reset: false };
      }
      if (!sure) throw new Error(`Switching to “${to.title}” resets the room: ${left.join(', ')}. All of it goes, and everybody is sent back to the join screen.`);
      await reset(to.talk_id);
      return { switched: true, reset: true };
    },
    'talk.reset': async () => {
      if (session.principal !== 'speaker') throw new Error('Only the speaker resets the talk.');
      return reset();
    },
  };
};

// The reset itself; `toTalk` is the talk the deck is left on — the one that is
// on, unless the speaker is switching.
const resetWith =
  (session: FunctionSession, server: () => MossServer, operatorKey: string, timing: () => Timing) =>
  async (toTalk?: string): Promise<{ done: boolean; people: number }> => {
    const vex = vexOver(session.wire);
    const members = MembersSchema.parse(await vex(memberRegister.fingerprint)).map((member) => member.member_id);
    const people = [...members, 'speaker'];
    for (const each of [resetPresses, resetQuestions, resetQueries, resetTurns]) await vex(each.fingerprint, { people });
    // …and what everybody was given: the one `everybody` row per role.
    await vex(resetGrants.fingerprint, { people: [...members, EVERYBODY] });
    await vex(resetMembers.fingerprint, { people: members });
    await vex(resetTimers.fingerprint, { savedBy: 'speaker' });
    await vex(resetRefused.fingerprint, { refused: RefusedSchema.parse(await vex(refusedAll.fingerprint)).map((row) => row.refused_id) });
    for (const surface of SURFACES) await vex(setRenderer.fingerprint, { surface, renderer: 'dom' });
    // The deck goes to the first slide — of the talk that is on, or of the one
    // being switched to.
    const talk = toTalk ?? z.object({ talk_id: z.string() }).parse(await vex(deckTalk.fingerprint)).talk_id;
    await vex(deckGo.fingerprint, { deck: TALK_DECK, talk, position: 0 });
    await removeVendor(server(), operatorKey);
    // The saved timers are gone from the table; unload them from tide too.
    await timing().reload();
    // Everybody is somebody else now: nobody, mostly. Their identity is read
    // again and their shell built again — the ones on a screen right now, and
    // the ones who are not.
    for (const member of members) server().invalidateIdentity(member);
    for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
    return { done: true, people: members.length };
  };
