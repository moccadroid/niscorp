import { mintDevToken } from '@niscorp/moss';

export type AuthUser = { id: string; username: string; name: string };

export const USERS: readonly AuthUser[] = [
  { id: 'usr_001', username: 'alex', name: 'Alex Morgan' },
  { id: 'usr_002', username: 'jordan', name: 'Jordan Chen' },
  { id: 'usr_003', username: 'sam', name: 'Sam Patel' },
];

export const userByUsername = (username: string): AuthUser | undefined =>
  USERS.find((u) => u.username === username.trim().toLowerCase());

export const mintToken = (username: string): string | null => {
  const user = userByUsername(username);
  if (user === undefined) return null;
  return mintDevToken(user.id, { name: user.name });
};
