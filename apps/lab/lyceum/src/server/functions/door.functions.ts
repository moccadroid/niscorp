import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { mintSession } from '@niscorp/moss';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import type { Moderation } from '../moderation';
import { vexOver, wireAs } from '../vex-over';

// STEPPING IN. The anonymous principal's one capability: become somebody, by
// a name they chose.
//
// `door.names` offers twelve names nobody has (server/names.ts), laid out two
// to a row. `door.enter` takes the chosen one. A name from the offer is used
// as it is; a name the person typed is judged first (server/moderation.ts),
// and one that cannot be shown is not used — it is kept for reference, and the
// door is answered with it and a name offered instead.
//
// The person is minted — a real session (moss's hashed-at-rest credential)
// for a fresh principal id — and then writes their own member row, as
// themselves, through the same governed door as every other write. They have
// the charter's `public` role until that row exists, and `public` may insert a
// member only with the engine stamping `member_id` from the session's own
// `userId` (vex/behaviors.ts): nobody can make a row for anybody else. Then
// `grant` hands the token to the terminal, which reconnects as the new member.

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OFFERED = 12;
const EnterSchema = z.looseObject({ chosen: z.string().trim().min(1, 'Choose a name first.').max(40, 'A name is 40 letters at most.'), typed: z.boolean() });

export const doorFunctions = (session: FunctionSession, server: () => MossServer, moderation: Moderation): Record<string, FunctionHandler> => ({
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
    const token = await mintSession(session.runtime.pool, memberId, SESSION_TTL_MS);
    // Two people pressing the same name at once: the second is told, as if it
    // had been taken a moment earlier — which it was.
    await vexOver(wireAs(server(), token))(memberJoin.fingerprint, { name: chosen }).catch(() => {
      throw new Error(`Somebody is already ${chosen}. Choose another.`);
    });
    // They were nobody a moment ago; they are a member now.
    server().invalidateIdentity(memberId);
    session.grant(token);
    return { name: '', suggested: '' };
  },
});
