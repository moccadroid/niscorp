// `sec-websocket-protocol` carries the session token on the socket, beside `nisc`.
export const CREDENTIAL_HEADERS: readonly string[] = ['authorization', 'cookie', 'proxy-authorization', 'x-operator-key', 'sec-websocket-protocol'];

// RFC 9110's `token`.
export const isHeaderName = (name: string): boolean => /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);
