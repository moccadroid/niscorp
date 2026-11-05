import assert from 'node:assert/strict';
import { createSignal } from '@niscorp/signal';
import { z } from 'zod';
import { createReviewOperation } from '../src/discovery/review.js';
import { discoveryProfile } from '../src/discovery/index.js';

// Exercise the production Signal/SDK path. Every HTTP response here is a local fixture.
const request = {
  instructions: 'Review the supplied data and return a verdict.',
  messages: [{ role: 'user', content: 'Fixture data.' }],
  settings: { ...discoveryProfile.settings, maxSteps: 1, outputAttempts: 1 },
  maxInputBytes: discoveryProfile.maxInputBytes,
};
const success = (): Response =>
  new Response(
    'data: ' +
      JSON.stringify({
        id: 'offline',
        choices: [
          {
            index: 0,
            delta: {
              content: JSON.stringify({
                data: { accepted: true, reason: 'Fixture verdict' },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
const limited = (retryAfter: string): Response =>
  new Response(
    JSON.stringify({
      error: { message: 'Fixture rate limit', type: 'tokens', code: 'rate_limit_exceeded' },
    }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': retryAfter } },
  );
const originalFetch = globalThis.fetch;
let checks = 0;
const check = async (
  name: string,
  respond: (attempt: number) => Response,
  inspect: (result: unknown, attempts: { retry: string | null; at: number; raw: string }[]) => void,
  controller = new AbortController(),
): Promise<void> => {
  const attempts: { retry: string | null; at: number; raw: string }[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, 'api.groq.com');
    const response = respond(attempts.length);
    const raw = await response.text();
    attempts.push({
      retry: new Headers(init?.headers).get('x-stainless-retry-count'),
      at: performance.now(),
      raw,
    });
    return new Response(raw, { status: response.status, headers: response.headers });
  };
  try {
    const operation = createReviewOperation({
      client: createSignal('groq', { apiKey: 'offline' }),
    });
    const result = await operation.run(request, { signal: controller.signal });
    inspect(result, attempts);
    checks++;
    console.log('[pass] Groq transport: ' + name);
  } finally {
    globalThis.fetch = originalFetch;
  }
};
const accepted = (result: unknown): void => {
  assert(
    z
      .object({ ok: z.literal(true), decision: z.object({ accepted: z.literal(true) }) })
      .safeParse(result).success,
  );
};
await check(
  'successful first response sends once without reservations or warmup',
  success,
  (result, attempts) => {
    accepted(result);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.retry, '0');
  },
);
await check(
  '429 waits for Retry-After then retries the same request',
  (attempt) => (attempt === 0 ? limited('0.04') : success()),
  (result, attempts) => {
    accepted(result);
    assert.deepEqual(
      attempts.map((a) => a.retry),
      ['0', '1'],
    );
    assert(attempts[1] && attempts[0]);
    assert(attempts[1].at - attempts[0].at >= 30);
    assert.equal(JSON.parse(attempts[0].raw).error.code, 'rate_limit_exceeded');
  },
);
const retryAt = Math.floor((Date.now() + 1500) / 1000) * 1000;
await check(
  'HTTP-date Retry-After is honoured',
  (attempt) => (attempt === 0 ? limited(new Date(retryAt).toUTCString()) : success()),
  (result, attempts) => {
    accepted(result);
    assert.equal(attempts.length, 2);
    assert(Date.now() >= retryAt);
  },
);
await check(
  'persistent 429 exhausts the existing SDK bound; raw usage stays unavailable',
  () => limited('0.001'),
  (result, attempts) => {
    assert.deepEqual(
      attempts.map((a) => a.retry),
      ['0', '1', '2'],
    );
    assert(z.object({ ok: z.literal(false) }).safeParse(result).success);
    // Runner usage accounting reads provider bodies, not aggregate SDK counters.
    assert(attempts.every((attempt) => !Object.hasOwn(JSON.parse(attempt.raw), 'usage')));
  },
);
await check(
  'non-retryable 400 returns a failure without waiting or another request',
  () =>
    new Response(JSON.stringify({ error: { message: 'Fixture invalid request' } }), {
      status: 400,
    }),
  (result, attempts) => {
    assert(z.object({ ok: z.literal(false) }).safeParse(result).success);
    assert.equal(attempts.length, 1);
  },
);
const controller = new AbortController();
let cancelledCalls = 0;
globalThis.fetch = async () => {
  cancelledCalls++;
  controller.abort(new Error('cancel-rate-limit'));
  return limited('0.01');
};
try {
  const operation = createReviewOperation({
    client: createSignal('groq', { apiKey: 'offline' }),
  });
  await assert.rejects(operation.run(request, { signal: controller.signal }), /cancel-rate-limit/);
  assert.equal(cancelledCalls, 1);
  checks++;
  console.log('[pass] Groq transport: cancellation prevents another transmission and publication');
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`Groq reactive rate limits: ${checks}/${checks} offline checks, zero paid calls.`);
