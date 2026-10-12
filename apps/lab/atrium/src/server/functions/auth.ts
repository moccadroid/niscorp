import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { mintToken, userById, userByUsername, SIBLINGS } from '@atrium/server/users';

export const authFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'auth.enter': async (data) => {
    const username = String(data['pending'] ?? '').trim();
    if (userByUsername(username) === undefined) throw new Error(`No such person: "${username}".`);
    const token = mintToken(username);
    if (token === null) throw new Error('Could not mint a session.');
    session.grant(token);
    return true;
  },
  'auth.leave': async () => {
    session.revoke();
    return true;
  },
  // Not a tenant bypass: a re-grant to the caller's declared sibling principal,
  // decided from the session, never from the request.
  'auth.switchProperty': async () => {
    const siblingId = SIBLINGS[session.principal ?? ''];
    const sibling = siblingId !== undefined ? userById(siblingId) : undefined;
    if (sibling === undefined) throw new Error('This account runs one property.');
    const token = mintToken(sibling.username);
    if (token === null) throw new Error('Could not mint the sibling session.');
    session.grant(token);
    return true;
  },
});
