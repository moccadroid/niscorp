export type SeamResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type SeamFetch = (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<SeamResponse>;

export type Seam = {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<unknown>;
  del: (path: string) => Promise<unknown>;
};

// The seam answers 404 to a wrong key and to a key that was never set alike.
const unwrap = async (response: SeamResponse, path: string): Promise<unknown> => {
  if (response.status === 404) throw new Error(`The operator seam did not answer ${path}. Check OPERATOR_KEY on both sides.`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; reasons?: string[] };
    const reasons = body.reasons === undefined ? '' : ` — ${body.reasons.join('; ')}`;
    const failure = new Error(`${body.message ?? `The seam answered ${response.status}.`}${reasons}`) as Error & { status?: number };
    failure.status = response.status;
    throw failure;
  }
  return response.json();
};

export const createSeam = (fetcher: SeamFetch, key: string): Seam => {
  const headers = { 'x-operator-key': key, 'content-type': 'application/json' };
  return {
    get: async (path) => unwrap(await fetcher(path, { method: 'GET', headers }), path),
    post: async (path, body) => unwrap(await fetcher(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) }), path),
    del: async (path) => unwrap(await fetcher(path, { method: 'DELETE', headers }), path),
  };
};

export const httpSeam = (base: string, key: string): Seam =>
  createSeam(async (path, init) => {
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, init);
    return { ok: response.ok, status: response.status, json: () => response.json() };
  }, key);
