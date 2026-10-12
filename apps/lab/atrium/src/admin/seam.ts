import { atriumBase, operatorKey } from './port';

export type SeamResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type SeamFetch = (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<SeamResponse>;

export type Seam = {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<unknown>;
};

// The seam answers 404 to a wrong key and to a key that was never set.
const unwrap = async (response: SeamResponse, path: string): Promise<unknown> => {
  if (response.status === 404) throw new Error(`The operator seam did not answer ${path}. Check OPERATOR_KEY on both sides.`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `The operator seam answered ${response.status}.`);
  }
  return response.json();
};

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
