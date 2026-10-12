import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { mintSession } from '@niscorp/moss';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import type { PgPool } from '@niscorp/vex';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import type { Moderation } from '../moderation';
import { vexOver, wireAs } from '../vex-over';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OFFERED = 12;
const EnterSchema = z.looseObject({ chosen: z.string().trim().min(1, 'Choose a name first.').max(40, 'A name is 40 letters at most.'), typed: z.boolean() });

export const doorFunctions = (session: FunctionSession, server: () => MossServer, pool: PgPool, moderation: Moderation): Record<string, FunctionHandler> => ({
  'door.names': async () => {
    const names = (await moderation.offer(OFFERED)).map((name, index) => ({ name, area: `n${index}` }));
    const rows = [];
    for (let i = 0; i < names.length; i += 2) rows.push([names[i]?.area ?? '.', names[i + 1]?.area ?? '.'].join(' '));
    return { names, areas: rows };
  },
  'door.enter': async (data) => {
    const { chosen, typed } = EnterSchema.parse(data);
    if (typed && !(await moderation.judgeName(chosen)).appropriate) {
      return { name: chosen, suggested: (await moderation.offer(1))[0] ?? '' };
    }
    if (await moderation.taken(chosen)) throw new Error(`Somebody is already ${chosen}. Choose another.`);
    const memberId = `m_${randomBytes(8).toString('hex')}`;
    const token = await mintSession(pool, memberId, SESSION_TTL_MS);
    // Two people pressing the same name at once: the second is told as if it
    // had been taken a moment earlier.
    await vexOver(wireAs(server(), token))(memberJoin.fingerprint, { name: chosen }).catch(() => {
      throw new Error(`Somebody is already ${chosen}. Choose another.`);
    });
    server().invalidateIdentity(memberId);
    session.grant(token);
    return { name: '', suggested: '' };
  },
});
