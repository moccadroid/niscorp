// Where the admin service listens, what it talks to, and the key it holds.
//
// Read LAZILY (functions, not constants), for the same reason the integrations
// service does it: the checks set these before boot, and import evaluation
// order must not be able to freeze a default in first.
export const adminPort = (): number => Number(process.env['ADMIN_PORT'] ?? 8790);

// The app whose operator seam we administer. The default is vite's dev server,
// which runs the app server in-process — that is the address a developer
// actually has open. `pnpm serve` puts it on 8787 instead.
//
// `localhost` rather than `127.0.0.1` on purpose: this same base is what the
// sign-in link is built from, and a browser treats the two as different origins.
// Print a link on one and the token lands in the other one's storage.
export const atriumBase = (): string => process.env['ATRIUM_URL'] ?? 'http://localhost:5175';

// OUR key, and the only thing that opens the seam. It lives in this process and
// in the app's, and nowhere else: no browser ever holds it, which is what makes
// the pill in a customer's page harmless.
export const operatorKey = (): string => process.env['OPERATOR_KEY'] ?? '';
