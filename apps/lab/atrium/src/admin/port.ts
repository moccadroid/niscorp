// Functions, not constants: the checks set these variables before boot, and a
// constant would freeze the default at import.
export const adminPort = (): number => Number(process.env['ADMIN_PORT'] ?? 8790);

// `localhost`, not `127.0.0.1`: the sign-in link is built from this base, and a
// browser treats the two as different origins with separate storage.
export const atriumBase = (): string => process.env['ATRIUM_URL'] ?? 'http://localhost:5175';

export const operatorKey = (): string => process.env['OPERATOR_KEY'] ?? '';
