import { randomBytes } from 'node:crypto';
import { mintSession } from '@niscorp/moss';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { issueCard } from '../card-issuing';
import type { Issuer } from '../issuer';
import { vexOver, wireAs } from '../vex-over';

// STEPPING IN. The anonymous principal's one capability: become somebody.
//
// The person is minted FIRST — a real session (moss's hashed-at-rest
// credential) for a fresh principal id — and then writes their own member row,
// as themselves, through the same governed door as every other write. They
// have the charter's `public` role until that row exists, and `public` may
// insert a member only with the engine stamping `member_id` from the session's
// own `userId` (vex/behaviors.ts): nobody can make a row for anybody else.
//
// Then `grant` hands the token to the terminal, which reconnects as the new
// principal — and the Ministry issues their ID card, which types itself onto
// their phone and onto the projector's register (./card-issuing.ts). The
// door does not wait for it: stepping in is instant, the card follows.

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const doorFunctions = (session: FunctionSession, server: () => MossServer, issuer: Issuer): Record<string, FunctionHandler> => ({
  'door.enter': async () => {
    const memberId = `m_${randomBytes(8).toString('hex')}`;
    const placeholder = `Newcomer ${memberId.slice(2, 6)}`;
    const token = await mintSession(session.runtime.pool, memberId, SESSION_TTL_MS);
    await vexOver(wireAs(server(), token))(memberJoin.fingerprint, { name: placeholder });
    // They were nobody a moment ago; they are a member now.
    server().invalidateIdentity(memberId);
    session.grant(token);
    void issueCard({ server: server(), pool: session.runtime.pool, issuer, memberId, placeholder }).catch((error: unknown) =>
      console.error(`[lyceum] issuing ${memberId}'s ID card failed:`, error),
    );
    return { memberId };
  },
});
