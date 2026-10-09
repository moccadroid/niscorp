import type { FetchFn } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';

// ── THE FLOOR UNDER A FAILING INTEGRATION ───────────────────────────
//
// A third-party service being down is the steady state of a marketplace, and
// the screen in front of it belongs to a studio owner, not an operator. A
// integration reply carrying no `message` falls through to the terminal's bare
// `HTTP 500` — a status code in front of a customer. So the session's wire
// puts a SENTENCE under every integration call: naming the integration, saying it
// is the integration, saying the studio is otherwise fine. A reply that DOES carry
// a message passes through untouched — the integration's own words always win —
// and no other path pays anything.
const INTEGRATION_PATH = /^\/integrations\/([a-z][a-z0-9-]*)\//;

export const flooredWire = (inner: FetchFn): FetchFn => async (url, init) => {
  const integration = INTEGRATION_PATH.exec(url)?.[1];
  if (integration === undefined) return inner(url, init);

  const floor = (status: number): Awaited<ReturnType<FetchFn>> => {
    const body = { message: `The ${integration} add-on is not answering right now. The rest of the studio is unaffected.` };
    return { ok: false, status, json: async () => body, text: async () => JSON.stringify(body) };
  };

  let reply: Awaited<ReturnType<FetchFn>>;
  try {
    reply = await inner(url, init);
  } catch {
    return floor(502);
  }
  if (reply.ok) return reply;

  try {
    const body: unknown = await reply.json();
    const message = isRecord(body) ? body['message'] : undefined;
    // The proxy's own generic phrase gets the same upgrade as silence — it
    // knows no integration name; this seam does.
    if (typeof message === 'string' && message !== 'The integration is unreachable.') {
      // Re-serve the consumed body — `json()` reads once.
      return { ok: false, status: reply.status, json: async () => body, text: async () => JSON.stringify(body) };
    }
  } catch {
    // Unparseable is the same case as silent.
  }
  return floor(reply.status);
};
