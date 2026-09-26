import type { FetchFn } from '@niscorp/nova';
import type { MossServer } from '@niscorp/moss';

// A VEX REPLAY THROUGH SOMEBODY'S OWN DOOR. A server function that touches
// data does it as the principal it acts for — over their session's wire, with
// their charter's verbs and their identity stamped by the engine — never as a
// machinery role (PLAN.md, "Vex is never hidden behind a function"). The write
// is observed like any other: reactive reads, reactions, tide.
export const vexOver =
  (wire: FetchFn) =>
  async (fingerprint: string, context: Record<string, unknown> = {}): Promise<unknown> => {
    const response = await wire('/api/vex', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprint, context }),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message = body !== null && typeof body === 'object' && 'message' in body ? String(body.message) : `refused (${response.status})`;
      throw new Error(`${fingerprint}: ${message}`);
    }
    return response.json();
  };

// The server's own wire, AS SOMEBODY: the same HTTP surface a terminal's
// session uses, authorised by that principal's token — for server code that
// acts for a principal it has a token for but no session of (a newcomer just
// minted at the door; the Ministry's registry issuing their card).
export const wireAs =
  (server: MossServer, token: string): FetchFn =>
  async (url, init) => {
    const response = await server.request(url, {
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` },
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    const text = await response.text();
    const body: unknown = text === '' ? null : JSON.parse(text);
    const result = body !== null && typeof body === 'object' && 'result' in body ? body.result : body;
    return { ok: response.ok, status: response.status, json: async () => (response.ok ? result : body), text: async () => text };
  };
