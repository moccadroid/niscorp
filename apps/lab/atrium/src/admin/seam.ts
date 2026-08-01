import { atriumBase, operatorKey } from './port';

// The client half of the operator seam — the ONE place this service talks to
// the app it administers, and the only place the key is used.
//
// It is a parameter rather than an import so the checks can hand in the app's
// own `server.request` and drive both halves in one process. That is not a test
// affordance bolted on: an administration tool is a client of a seam, and a
// client that can only reach it over a socket is a client welded to a
// deployment.

export type SeamResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type SeamFetch = (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<SeamResponse>;

export type Seam = {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<unknown>;
};

// A refusal reads as a sentence, because that is what a pane shows. 404 is the
// seam's answer to a wrong key AND to a key that was never set, deliberately:
// the tool cannot tell an unset key from a bad one, and neither can anyone else.
const unwrap = async (response: SeamResponse, path: string): Promise<unknown> => {
  if (response.status === 404) throw new Error(`The operator seam did not answer ${path}. Check OPERATOR_KEY on both sides.`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `The operator seam answered ${response.status}.`);
  }
  return response.json();
};

// HTTP to a running app server. The default when nothing is injected.
const httpFetch = (base: string): SeamFetch => async (path, init) => {
  const response = await fetch(`${base}${path}`, init);
  return { ok: response.ok, status: response.status, json: () => response.json() as Promise<unknown> };
};

export const createSeam = (config: { fetch?: SeamFetch; base?: string; key?: string } = {}): Seam => {
  const call = config.fetch ?? httpFetch(config.base ?? atriumBase());
  const headers = (): Record<string, string> => ({ 'content-type': 'application/json', 'x-operator-key': config.key ?? operatorKey() });
  return {
    get: async (path) => unwrap(await call(path, { method: 'GET', headers: headers() }), path),
    post: async (path, body) => unwrap(await call(path, { method: 'POST', headers: headers(), body: JSON.stringify(body ?? {}) }), path),
  };
};
