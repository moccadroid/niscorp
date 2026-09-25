import { randomBytes } from 'node:crypto';
import { mintSession } from '@niscorp/moss';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { memberJoin } from '@lyceum/app/vex/member.entries';

// STEPPING IN. The anonymous principal's one capability: become somebody.
//
// The member row is written as the `doorkeeper` — a charter role that can
// insert a member and nothing else — and the person receives a real session
// (moss's hashed-at-rest credential). `grant` hands it to the terminal, which
// reconnects as the new principal; their shell is then built from their row.
//
// The name is a placeholder until persona generation lands (PLAN.md, order of
// work 5): the persona-maker will write the real one.

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const doorFunctions = (session: FunctionSession, server: () => MossServer): Record<string, FunctionHandler> => ({
  'door.enter': async () => {
    const memberId = `m_${randomBytes(8).toString('hex')}`;
    const name = `Newcomer ${memberId.slice(2, 6)}`;
    // executeAs answers undefined for a refusal, and logs why.
    const written = await server().executeAs('doorkeeper', memberJoin.fingerprint, { memberId, name });
    if (written === undefined) throw new Error('The door would not open. Try again.');
    const token = await mintSession(session.runtime.pool, memberId, SESSION_TTL_MS);
    session.grant(token);
    return { memberId };
  },
});
