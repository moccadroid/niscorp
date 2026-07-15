import { lsGet, lsSet, lsRemove } from '../storage';
import { decodeToken, type Token } from './token';

// The current session: one token string in localStorage. Everything outside
// src/auth consumes `identity()` — how sign-in works is invisible to the
// rest of the app, so the whole mechanism can be swapped later.
export type Identity = { userId: string; name: string };

const KEY = 'relay.token';
const listeners = new Set<() => void>();
const notify = (): void => {
  for (const fn of listeners) fn();
};

// Browser: the token lives in localStorage. Headless (checks, node): an
// in-memory slot — signIn/signOut still work, so scripts exercise the real
// auth path instead of stubbing identity.
const hasDom = typeof window !== 'undefined';
let memoryToken: string | null = null;
const read = (): string | null => (hasDom ? lsGet(KEY) : memoryToken);
const write = (value: string | null): void => {
  if (hasDom) {
    if (value === null) lsRemove(KEY);
    else lsSet(KEY, value);
  } else {
    memoryToken = value;
  }
};

export const identity = (): Identity | null => {
  const raw = read();
  if (raw === null) return null;
  const token: Token | null = decodeToken(raw);
  return token === null ? null : { userId: token.sub, name: token.name };
};

export const signIn = (token: string): void => {
  write(token);
  notify();
};

export const signOut = (): void => {
  write(null);
  notify();
};

export const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
