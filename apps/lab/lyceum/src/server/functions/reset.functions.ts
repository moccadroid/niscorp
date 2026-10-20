import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer } from '@niscorp/moss';
import { TALK_DECK, deckGo } from '@lyceum/app/vex/deck.entries';
import { EVERYBODY } from '@lyceum/app/vex/grant.entries';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { setRenderer } from '@lyceum/app/vex/renderer.entries';
import { refusedAll, resetGrants, resetMembers, resetPresses, resetQueries, resetQuestions, resetRefused, resetTimers, resetTurns } from '@lyceum/app/vex/reset.entries';
import type { Timing } from '../timing';
import { vexOver } from '../vex-over';
import { removeVendor } from './integration.functions';

// `talk.reset` deletes what points at a person before the person.
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const RefusedSchema = z.array(z.object({ refused_id: z.string() }));
const SURFACES = ['phones', 'stage', 'controller'];

export const resetFunctions = (session: FunctionSession, server: () => MossServer, operatorKey: string, timing: () => Timing): FunctionDefinition[] => [
  {
    id: 'talk.reset',
    description: 'Starts the talk over: deletes the members and what they pressed, asked and were given, the speaker’s timers and the QA Company’s integration, draws every surface with dom and puts the deck at its first slide. The speaker only. Send nothing; answers { done, people }.',
    execute: async () => {
      if (session.principal !== 'speaker') throw new Error('Only the speaker resets the talk.');
      const vex = vexOver(session.wire);
      const members = MembersSchema.parse(await vex(memberRegister.fingerprint)).map((member) => member.member_id);
      const people = [...members, 'speaker'];
      for (const each of [resetPresses, resetQuestions, resetQueries, resetTurns]) await vex(each.fingerprint, { people });
      await vex(resetGrants.fingerprint, { people: [...members, EVERYBODY] });
      await vex(resetMembers.fingerprint, { people: members });
      await vex(resetTimers.fingerprint, { savedBy: 'speaker' });
      await vex(resetRefused.fingerprint, { refused: RefusedSchema.parse(await vex(refusedAll.fingerprint)).map((row) => row.refused_id) });
      for (const surface of SURFACES) await vex(setRenderer.fingerprint, { surface, renderer: 'dom' });
      await vex(deckGo.fingerprint, { deck: TALK_DECK, position: 0 });
      await removeVendor(server(), operatorKey);
      await timing().reload();
      for (const member of members) server().invalidateIdentity(member);
      for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
      return { done: true, people: members.length };
    },
  },
];
