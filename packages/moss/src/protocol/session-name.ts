// What a browser's session goes by. The server writes the cookies and a page
// reads the one it may see, so both have to arrive at the same name
// (../session-cookie.ts says what the cookies are for).

export const DEFAULT_TOKEN_KEY = 'nisc.token';

// The name for one key on one port. It ends with the port when the page is on
// one: a browser keeps cookies by host and not by port, and two apps on
// localhost would otherwise sign each other out.
export const sessionNameOf = (key: string, port: string): string => `${key}${port === '' ? '' : `.${port}`}`;

// The flag's name, as a terminal on `port` reads it out of `document.cookie`.
export const heldCookieName = (key = DEFAULT_TOKEN_KEY, port = ''): string => encodeURIComponent(`${sessionNameOf(key, port)}.held`);
