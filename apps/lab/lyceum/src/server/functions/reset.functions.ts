import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer } from '@niscorp/moss';
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
import { removeVendors } from './integration.functions';

// `talk.reset` deletes what points at a person before the person.
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const RefusedSchema = z.array(z.object({ refused_id: z.string() }));
const SURFACES = ['phones', 'stage', 'controller'];

const SwitchSchema = z.object({ picked: z.string().min(1), sure: z.boolean().default(false) });
const TalksSchema = z.array(z.object({ talk_id: z.string(), title: z.string() }));
const TallySchema = z.object({ replayed: z.number(), generated: z.number(), refused: z.number() });
const counted = (count: number, one: string, many: string): string[] => (count === 0 ? [] : [`${count} ${count === 1 ? one : many}`]);

export const resetFunctions = (session: FunctionSession, server: () => MossServer, operatorKey: string, timing: () => Timing, resetScreens: () => Promise<void>): FunctionDefinition[] => {
  const reset = resetWith(session, server, operatorKey, timing, resetScreens);
  return [
    {
      id: 'talk.switch',
      description: 'Puts another talk on: the deck moves to its first slide. With people joined, queries run, questions sent or timers saved, it is refused until `sure`, and then the room is reset. The speaker only. Send { picked, sure }; answers { switched, reset }.',
      execute: async (input) => {
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
        if (to.talk_id === on.talk_id || left.length === 0) {
          await vex(deckGo.fingerprint, { deck: TALK_DECK, talk: to.talk_id, position: 0 });
          return { switched: true, reset: false };
        }
        if (!sure) throw new Error(`Switching to “${to.title}” resets the room: ${left.join(', ')}. All of it goes, and everybody is sent back to the join screen.`);
        await reset(to.talk_id);
        return { switched: true, reset: true };
      },
    },
    {
      id: 'talk.reset',
      description: 'Starts the talk over: deletes the members and what they pressed, asked and were given, the speaker’s timers and the QA Company’s integration, draws every surface with dom and puts the deck at the first slide of the talk that is on. The speaker only. Send nothing; answers { done, people }.',
      execute: async () => {
        if (session.principal !== 'speaker') throw new Error('Only the speaker resets the talk.');
        return reset();
      },
    },
  ];
};

const resetWith =
  (session: FunctionSession, server: () => MossServer, operatorKey: string, timing: () => Timing, resetScreens: () => Promise<void>) =>
  async (toTalk?: string): Promise<{ done: boolean; people: number }> => {
    const vex = vexOver(session.wire);
    const members = MembersSchema.parse(await vex(memberRegister.fingerprint)).map((member) => member.member_id);
    const people = [...members, 'speaker'];
    for (const each of [resetPresses, resetQuestions, resetQueries, resetTurns]) await vex(each.fingerprint, { people });
    await vex(resetGrants.fingerprint, { people: [...members, EVERYBODY] });
    await vex(resetMembers.fingerprint, { people: members });
    await vex(resetTimers.fingerprint, { savedBy: 'speaker' });
    await vex(resetRefused.fingerprint, { refused: RefusedSchema.parse(await vex(refusedAll.fingerprint)).map((row) => row.refused_id) });
    for (const surface of SURFACES) await vex(setRenderer.fingerprint, { surface, renderer: 'dom' });
    const talk = toTalk ?? z.object({ talk_id: z.string() }).parse(await vex(deckTalk.fingerprint)).talk_id;
    await vex(deckGo.fingerprint, { deck: TALK_DECK, talk, position: 0 });
    await removeVendors(server(), operatorKey);
    await resetScreens();
    await timing().reload();
    for (const member of members) server().invalidateIdentity(member);
    for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
    return { done: true, people: members.length };
  };
