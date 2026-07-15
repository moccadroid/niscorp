import { userByUsername } from './users';

// The session token: identity travels HERE and nowhere else — there is no
// global user constant in the app. The encoding is base64url JSON and
// explicitly fake: mintToken is the single function to replace with real
// signing when real auth arrives; decodeToken is the only reader.
export type Token = { sub: string; name: string; iat: number };

const b64url = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export const mintToken = (username: string): string | null => {
  const user = userByUsername(username);
  if (user === undefined) return null;
  const token: Token = { sub: user.id, name: user.name, iat: Date.now() };
  return b64url(JSON.stringify(token));
};

export const decodeToken = (raw: string): Token | null => {
  try {
    const parsed: unknown = JSON.parse(unb64url(raw));
    if (parsed === null || typeof parsed !== 'object') return null;
    const t = parsed as Partial<Token>;
    return typeof t.sub === 'string' && typeof t.name === 'string' && typeof t.iat === 'number' ? (t as Token) : null;
  } catch {
    return null;
  }
};
