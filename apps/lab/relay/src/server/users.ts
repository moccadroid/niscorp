import { mintDevToken } from '@niscorp/moss';

// The demo identity directory — SERVER-side only (a stand-in for a real
// identity provider). The browser never sees it: usernames resolve here,
// tokens mint here (the login fn) and in dev checks. ROLES do not live on
// the user — they live in the charter's assignments, keyed by id.
export type AuthUser = { id: string; username: string; name: string };

export const USERS: readonly AuthUser[] = [
  { id: 'usr_001', username: 'alex', name: 'Alex Morgan' },
  { id: 'usr_002', username: 'jordan', name: 'Jordan Chen' },
  { id: 'usr_003', username: 'sam', name: 'Sam Patel' },
];

export const userByUsername = (username: string): AuthUser | undefined =>
  USERS.find((u) => u.username === username.trim().toLowerCase());

// The dev mint — moss's dev token pair does the mechanics; real auth
// replaces the mint, not this seam.
export const mintToken = (username: string): string | null => {
  const user = userByUsername(username);
  if (user === undefined) return null;
  return mintDevToken(user.id, { name: user.name });
};
