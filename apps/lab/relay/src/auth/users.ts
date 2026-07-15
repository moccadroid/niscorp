// The identity directory — the stand-in for whatever real identity provider
// arrives later; identity storage is explicitly not ours to build. Mirrors
// the seed's first three users (seed.ts FIRST/LAST pools). Sign-in resolves
// a username here; ROLES do not live on the user — they live in the
// charter's assignment table.
export type AuthUser = { id: string; username: string; name: string };

export const USERS: readonly AuthUser[] = [
  { id: 'usr_001', username: 'alex', name: 'Alex Morgan' },
  { id: 'usr_002', username: 'jordan', name: 'Jordan Chen' },
  { id: 'usr_003', username: 'sam', name: 'Sam Patel' },
];

export const userByUsername = (username: string): AuthUser | undefined =>
  USERS.find((u) => u.username === username.trim().toLowerCase());
