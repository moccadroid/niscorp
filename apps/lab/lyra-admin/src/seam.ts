// THE ONE PLACE THIS TOOL TALKS TO LYRA, and the only place the key is used.
//
// A parameter rather than an import, so a check can hand in Lyra's own
// `server.request` and drive both halves in one process. That is not a test
// affordance: an administration tool is a client of a seam, and a client that
// can only reach it over a socket is a client welded to a deployment.

export type SeamResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type SeamFetch = (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<SeamResponse>;

export type Seam = {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<unknown>;
  del: (path: string) => Promise<unknown>;
};

// A refusal reads as a sentence, because that is what a pane shows. 404 is the
// seam's answer to a wrong key AND to a key that was never set, deliberately —
// the tool cannot tell one from the other, and neither can anybody else.
const unwrap = async (response: SeamResponse, path: string): Promise<unknown> => {
  if (response.status === 404) throw new Error(`The operator seam did not answer ${path}. Check OPERATOR_KEY on both sides.`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; reasons?: string[] };
    const reasons = body.reasons === undefined ? '' : ` — ${body.reasons.join('; ')}`;
    // The status rides along, because a caller has to be able to tell an
    // input error (nothing was written, tell the operator now) from a service
    // error (a row recorded it, the card will say so and keep saying so).
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

// The default fetcher: a real socket to a running Lyra.
export const httpSeam = (base: string, key: string): Seam =>
  createSeam(async (path, init) => {
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, init);
    return { ok: response.ok, status: response.status, json: () => response.json() };
  }, key);
