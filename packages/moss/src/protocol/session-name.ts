export const DEFAULT_TOKEN_KEY = 'nisc.token';

// The name ends with the port because a browser keeps cookies by host and not by port: two apps
// on localhost would otherwise sign each other out.
export const sessionNameOf = (key: string, port: string): string => `${key}${port === '' ? '' : `.${port}`}`;

export const heldCookieName = (key = DEFAULT_TOKEN_KEY, port = ''): string => encodeURIComponent(`${sessionNameOf(key, port)}.held`);
