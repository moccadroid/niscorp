import { describe, it, expect } from 'vitest';
import type { FetchFn } from '@niscorp/nova';
import { withFallbackMessage } from '../src/integrations/forward';

const FLOOR = { message: 'The belts integration is not answering right now. The rest of the app is unaffected.' };

type Reply = Awaited<ReturnType<FetchFn>>;
const replying = (reply: Reply | Error): FetchFn => async () => {
  if (reply instanceof Error) throw reply;
  return reply;
};
const failing = (status: number, body: unknown): Reply => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });

const answered = async (inner: FetchFn, url = '/integrations/belts/api/stock'): Promise<{ ok: boolean; status: number; body: unknown }> => {
  const reply = await withFallbackMessage(inner)(url);
  return { ok: reply.ok, status: reply.status, body: await reply.json() };
};

describe('the message under a failing integration', () => {
  it('a reply that carries a message is the integration’s own words, whole', async () => {
    const body = { message: 'Out of stock until Friday.', code: 'stock' };
    expect(await answered(replying(failing(409, body)))).toEqual({ ok: false, status: 409, body });
  });

  it.each([
    ['no message', { error: 'boom' }],
    ['a message that is not text', { message: 500 }],
    ['a list', [{ message: 'in a list' }]],
    ['a number', 500],
    ['nothing', null],
    ['the proxy’s own phrase, which names no integration', { message: 'The integration is unreachable.' }],
  ])('a failed reply with %s gets the sentence, under the status it had', async (_what, body) => {
    expect(await answered(replying(failing(500, body)))).toEqual({ ok: false, status: 500, body: FLOOR });
  });

  it('a failed reply that is not JSON gets the sentence', async () => {
    const notJson: Reply = { ok: false, status: 503, json: async () => JSON.parse('<html>'), text: async () => '<html>' };
    expect(await answered(replying(notJson))).toEqual({ ok: false, status: 503, body: FLOOR });
  });

  it('a call that throws gets the sentence, as 502', async () => {
    expect(await answered(replying(new Error('ECONNREFUSED')))).toEqual({ ok: false, status: 502, body: FLOOR });
  });

  it('a reply that is fine, and a call that is not an integration’s, are not touched', async () => {
    const fine: Reply = { ok: true, status: 200, json: async () => ({ rows: [] }), text: async () => '{"rows":[]}' };
    expect(await answered(replying(fine))).toEqual({ ok: true, status: 200, body: { rows: [] } });
    expect(await answered(replying(failing(500, { error: 'boom' })), '/api/vex')).toEqual({ ok: false, status: 500, body: { error: 'boom' } });
  });
});
