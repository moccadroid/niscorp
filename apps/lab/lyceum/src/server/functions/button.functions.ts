import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer } from '@niscorp/moss';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { buttonHolders } from '@lyceum/app/vex/grant.entries';
import { vexOver } from '../vex-over';

const SHARE = 0.25;
const AT_LEAST = 3;
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const HoldersSchema = z.array(z.object({ principal: z.string() }));

export const buttonFunctions = (session: FunctionSession, server: () => MossServer): FunctionDefinition[] => [
  {
    id: 'button.pick',
    description: 'Picks who is given the button next: a quarter of the members, at least three, from those who hold none yet, connected ones first. The speaker only. Send nothing; answers [{ member_id }].',
    execute: async () => {
      if (session.principal !== 'speaker') throw new Error('Only the speaker gives the button.');
      const vex = vexOver(session.wire);
      const has = new Set(HoldersSchema.parse(await vex(buttonHolders.fingerprint)).map((row) => row.principal));
      const members = MembersSchema.parse(await vex(memberRegister.fingerprint));
      const rest = members.filter((member) => !has.has(member.member_id));
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
  },
];
