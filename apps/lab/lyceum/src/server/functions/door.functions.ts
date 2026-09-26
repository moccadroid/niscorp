import { randomBytes } from 'node:crypto';
import { mintSession } from '@niscorp/moss';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FetchFn, FunctionHandler } from '@niscorp/nova';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { vexOver } from '../vex-over';

// STEPPING IN. The anonymous principal's one capability: become somebody.
//
// The person is minted FIRST — a real session (moss's hashed-at-rest
// credential) for a fresh principal id — and then writes their own member row,
// as themselves, through the same governed door as every other write. They
// hold the charter's `public` role until that row exists, and `public` may
// insert a member only with the engine stamping `member_id` from the session's
// own `userId` (vex/behaviors.ts): nobody can make a row for anybody else. No
// machinery role acts for them.
//
// Then `grant` hands the token to the terminal, which reconnects as the new
// principal; their shell is built from their row.
//
// The name is a placeholder until persona generation lands (PLAN.md, order of
// work 5): the persona-maker will write the real one.

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// The server's own wire, as the new principal: the same HTTP surface a
// terminal's session uses, authorised by their token.
const wireAs =
  (server: MossServer, token: string): FetchFn =>
  async (url, init) => {
    const response = await server.request(url, {
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` },
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    const text = await response.text();
    const body: unknown = text === '' ? null : JSON.parse(text);
    const result = body !== null && typeof body === 'object' && 'result' in body ? body.result : body;
    return { ok: response.ok, status: response.status, json: async () => (response.ok ? result : body), text: async () => text };
  };

export const doorFunctions = (session: FunctionSession, server: () => MossServer): Record<string, FunctionHandler> => ({
  'door.enter': async () => {
    const memberId = `m_${randomBytes(8).toString('hex')}`;
    const name = `Newcomer ${memberId.slice(2, 6)}`;
    const token = await mintSession(session.runtime.pool, memberId, SESSION_TTL_MS);
    await vexOver(wireAs(server(), token))(memberJoin.fingerprint, { name });
    // They were nobody a moment ago; they are a member now.
    server().invalidateIdentity(memberId);
    session.grant(token);
    return { memberId };
  },
});
