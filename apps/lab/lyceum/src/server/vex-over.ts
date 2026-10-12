import type { FetchFn } from '@niscorp/nova';
import type { MossServer } from '@niscorp/moss';

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
