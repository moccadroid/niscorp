import type { FetchFn } from '@niscorp/nova';

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
