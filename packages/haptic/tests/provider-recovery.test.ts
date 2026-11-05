import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { DiscoveryResultSchema } from '../src/discovery/discovery-result.schema.js';
import { createModelClient } from '../src/discovery/model-transport.js';
import { captureBody } from '../src/operations/http-source.js';
import { defineOperation } from '../src/engine/operation.js';

// Actual Signal/SDK/Cortex path, controlled provider responses only; no paid calls.
const originalFetch = globalThis.fetch;
const success = (data: unknown): Response =>
  new Response(
    'data: ' +
      JSON.stringify({
        choices: [
          { index: 0, delta: { content: JSON.stringify({ data }) }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
const limited = (delay = '0.005'): Response =>
  new Response(
    JSON.stringify({
      error: { message: 'UNTRUSTED_PROVIDER_BODY', code: 'rate_limit_exceeded' },
    }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': delay } },
  );
const profile = (maxRetries: number) => ({
  ...discoveryProfile,
  modelTransport: {
    ...discoveryProfile.modelTransport,
    rateLimit: { ...discoveryProfile.modelTransport.rateLimit },
    openaiCompatible: { maxRetries },
  },
});
const modelInput = {
  instructions: 'Review controlled records.',
  messages: [{ role: 'user', content: 'Controlled data.' }],
  settings: { ...discoveryProfile.settings, maxSteps: 1, outputAttempts: 1 },
  maxInputBytes: discoveryProfile.maxInputBytes,
};

try {
  for (const recover of [true, false]) {
    const transmissions: { body: string; at: number; retry: string | null }[] = [];
    globalThis.fetch = async (_url, init) => {
      transmissions.push({
        body: String(init?.body),
        at: Date.now(),
        retry: new Headers(init?.headers).get('x-stainless-retry-count'),
      });
      return recover && transmissions.length === 6
        ? success({ accepted: true, reason: 'Controlled verdict' })
        : limited();
    };
    const discovery = createDiscoveryOperations({
      author: { apiKey: 'offline' },
      profile: profile(recover ? 5 : 1),
    });
    try {
      const operation = discovery.operations['result.review'];
      assert(operation);
      const result = await operation.run(modelInput, { signal: AbortSignal.timeout(10000) });
      if (recover) {
        assert(z.object({ ok: z.literal(true) }).safeParse(result).success);
        assert.equal(transmissions.length, 6);
        assert.equal(new Set(transmissions.map((t) => t.body)).size, 1);
        assert.deepEqual(
          transmissions.map((t) => t.retry),
          ['0', '1', '2', '3', '4', '5'],
        );
      } else {
        const blocked = z
          .object({
            ok: z.literal(false),
            error: z.object({
              kind: z.literal('provider'),
              code: z.literal('PROVIDER_RATE_LIMITED'),
              status: z.literal(429),
              retryAfterMs: z.number(),
            }),
          })
          .parse(result);
        assert(blocked.error.retryAfterMs <= 5 && blocked.error.retryAfterMs >= 0);
        assert.equal(transmissions.length, 2);
        assert(!JSON.stringify(result).includes('UNTRUSTED_PROVIDER_BODY'));
      }
      for (let i = 1; i < transmissions.length; i++)
        assert((transmissions[i]?.at ?? 0) - (transmissions[i - 1]?.at ?? 0) >= 4);
    } finally {
      discovery.close();
    }
  }
  console.log(
    '[pass] provider recovery: sixth transmission succeeds in the same Cortex step; exhausted JSON bound retains structured provider facts',
  );

  // A shared client/model observes actual cooldown; another model is independent.
  const calls: { model: string; at: number }[] = [];
  let first: (() => void) | undefined;
  const seen = new Promise<void>((resolve) => {
    first = resolve;
  });
  globalThis.fetch = async (_url, init) => {
    const { model } = z.object({ model: z.string() }).parse(JSON.parse(String(init?.body)));
    calls.push({ model, at: Date.now() });
    if (calls.length === 1) {
      first?.();
      return limited('0.08');
    }
    return success({ accepted: true });
  };
  const shared = createModelClient({
    provider: 'groq',
    apiKey: 'offline',
    transport: profile(1).modelTransport,
  }).client;
  const request = { messages: [{ role: 'user' as const, content: 'Controlled data' }] };
  const pending = shared.model('openai/gpt-oss-120b').step(request);
  await seen;
  // Let the first received 429 establish the cooldown before dispatching siblings.
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
  const same = shared.model('openai/gpt-oss-120b').step(request);
  const other = shared.model('independent-model').step(request);
  await Promise.all([pending, same, other]);
  const start = calls[0]?.at;
  assert(start !== undefined);
  assert((calls.find((c) => c.model === 'independent-model')?.at ?? Infinity) - start < 75);
  assert(
    calls
      .filter((c) => c.model === 'openai/gpt-oss-120b')
      .slice(1)
      .every((c) => c.at - start >= 70),
  );
  console.log(
    '[pass] provider recovery: reactive cooldown is shared within one client/model, with no preemptive wait or cross-model blocking',
  );

  for (const format of ['milliseconds', 'date', 'fallback'] as const) {
    const attempts: number[] = [];
    const date = Math.floor((Date.now() + 1200) / 1000) * 1000;
    globalThis.fetch = async () => {
      attempts.push(Date.now());
      if (attempts.length > 1) return success({ accepted: true, reason: 'Controlled verdict' });
      const headers = new Headers({ 'content-type': 'application/json' });
      if (format === 'milliseconds') {
        headers.set('retry-after-ms', '45');
        headers.set('retry-after', '0.005');
      } else if (format === 'date') headers.set('retry-after', new Date(date).toUTCString());
      return new Response('{}', { status: 429, headers });
    };
    const configured = profile(1);
    configured.modelTransport.rateLimit.fallbackWaitMs = 20;
    const discovery = createDiscoveryOperations({
      author: { apiKey: 'offline' },
      profile: configured,
    });
    try {
      const operation = discovery.operations['result.review'];
      assert(operation);
      const result = await operation.run(modelInput, { signal: AbortSignal.timeout(10000) });
      assert(z.object({ ok: z.literal(true) }).safeParse(result).success);
      assert.equal(attempts.length, 2);
      const first = attempts[0],
        second = attempts[1];
      assert(first !== undefined && second !== undefined);
      if (format === 'date') assert(second >= date);
      else assert(second - first >= (format === 'milliseconds' ? 40 : 15));
    } finally {
      discovery.close();
    }
  }
  console.log(
    '[pass] provider recovery: original millisecond header takes priority, HTTP date and JSON fallback delays are honoured',
  );

  const fixture = captureBody(
    Buffer.from('<main><article>First</article><article>Second</article></main>'),
  );
  for (const mode of [
    'recover-source',
    'blocked-source',
    'blocked-review',
    'blocked-repair',
    'timed-review',
    'timed-source',
    'timed-schema',
    'timed-repair-source',
    'caller-cancel',
  ] as const) {
    let gets = 0,
      sourceCalls = 0,
      reviewCalls = 0;
    const caller = new AbortController();
    let quotaAt = 0;
    const quota = (delay?: string): Response => {
      quotaAt ||= performance.now();
      return limited(delay);
    };
    const sourceBodies: string[] = [];
    globalThis.fetch = async (_url, init) => {
      const body = z
        .object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) })
        .parse(JSON.parse(String(init?.body)));
      const has = (label: string) => body.messages.some((m) => m.content.startsWith(label));
      if (has('OFFERED RESULT FLOWS\n'))
        return success({ requiresNavigation: false, resultFlow: null });
      if (has('SOURCE AUTHORING CONTEXT\n')) {
        sourceCalls++;
        if (mode === 'timed-source' || (mode === 'timed-repair-source' && reviewCalls))
          return quota('1');
        if (mode === 'blocked-source' || (mode === 'blocked-repair' && reviewCalls)) return quota();
        if (mode === 'recover-source') {
          if (sourceCalls === 1)
            return success({
              action: 'inspect',
              source: 0,
              query: { selector: 'article' },
              window: { offset: 0, limit: 10 },
            });
          sourceBodies.push(String(init?.body));
          if (sourceCalls <= 5) return quota();
          assert(
            body.messages.some((m) => m.role === 'assistant' && m.content.includes('inspect')),
          );
        }
        return success({
          action: 'propose',
          candidate: { selector: 'article', fields: null, links: null, result: null },
        });
      }
      if (has('CURRENT MAPPING FEEDBACK\n'))
        return success({ $pluck: { over: { $ref: '$.input.records' }, key: 'text' } });
      if (has('OBSERVED NATIVE INPUT') && mode === 'timed-schema') return quota('1');
      if (has('DATA TO REVIEW\n')) {
        reviewCalls++;
        if (mode === 'blocked-review') return quota();
        if (mode === 'timed-review') return quota('1');
        if (mode === 'caller-cancel') {
          setTimeout(() => caller.abort(new Error('Caller stopped quota waiting')), 20);
          return quota('1');
        }
        return success({
          accepted: mode !== 'blocked-repair' && mode !== 'timed-repair-source',
          reason: 'Controlled semantic verdict',
        });
      }
      throw Error('Unexpected controlled model request');
    };
    const discovery = createDiscoveryOperations({
      author: { apiKey: 'offline' },
      profile: {
        ...profile(mode === 'recover-source' ? 5 : 1),
        author: {
          ...discoveryProfile.author,
          maxModelMs:
            mode.startsWith('timed-') && mode !== 'timed-review'
              ? 300
              : discoveryProfile.author.maxModelMs,
        },
        review: { ...discoveryProfile.review, maxModelMs: mode === 'timed-review' ? 50 : 60000 },
      },
      mechanical: {
        'http.get': defineOperation({
          input: z.object({ url: z.url() }),
          output: z.json(),
          run({ url }) {
            gets++;
            return {
              url,
              status: 200,
              headers: { 'content-type': ['text/html'] },
              encoded: fixture,
              body: fixture,
            };
          },
        }),
      },
    });
    try {
      const prepared = await prepareArtifact(
        discoveryWorkflow,
        discovery.operations,
        discovery.limits,
      );
      const input = {
        url: 'https://provider-recovery.invalid/',
        instruction: 'Return all labels.',
        ...(mode === 'timed-schema'
          ? {}
          : { outputSchema: { type: 'array', items: { type: 'string' } } }),
      };
      if (mode === 'caller-cancel') {
        await assert.rejects(prepared.run(input, { signal: caller.signal }), { code: 'CANCELLED' });
        assert.equal(gets, 1);
        assert.equal(reviewCalls, 1);
        assert(
          performance.now() - quotaAt < 800,
          'Caller cancellation must not await the SDK Retry-After sleep',
        );
        continue;
      }
      const result = await prepared.run(input);
      assert.equal(result.status, 'completed', JSON.stringify(result));
      const output = DiscoveryResultSchema.parse(result.value);
      if (mode.startsWith('timed-'))
        assert(
          performance.now() - quotaAt < 800,
          'Owned time allowance must interrupt quota waiting promptly',
        );
      if (mode === 'blocked-source' || mode === 'timed-source' || mode === 'timed-schema') {
        assert.equal(
          output.status,
          'blocked',
          JSON.stringify({ mode, reason: output.reason, blocked: output.blocked }),
        );
        assert.equal(output.artifact, null);
        assert.equal(output.blocked?.status, 429);
        assert.equal(gets, 1);
      } else {
        assert.equal(output.status, 'ready');
        assert(output.artifact);
        assert.deepEqual(z.object({ data: z.json() }).parse(output.trial?.value).data, [
          'First',
          'Second',
        ]);
        assert.equal(
          gets,
          2,
          'Quota retries must reuse the initial capture; only final verification refetches',
        );
        if (mode === 'recover-source') {
          assert.equal(new Set(sourceBodies).size, 1);
          assert.equal(output.blocked, null);
        } else
          assert.equal(
            output.blocked?.status,
            429,
            'Working artifacts survive provider blockage during review or repair',
          );
        if (mode === 'blocked-repair' || mode === 'timed-repair-source')
          assert.equal(output.repair.attempts, 1);
      }
    } finally {
      discovery.close();
    }
  }
  console.log(
    '[pass] provider recovery: same history/capture resumes; public blocked status is distinct; working artifacts survive review and repair quota exhaustion',
  );

  let dispatches = 0;
  globalThis.fetch = async () => {
    dispatches++;
    return limited('1');
  };
  const discovery = createDiscoveryOperations({ author: { apiKey: 'offline' } });
  try {
    const operation = discovery.operations['result.review'];
    assert(operation);
    const result = await operation.run(
      { ...modelInput, settings: { ...modelInput.settings, maxMs: 50 } },
      { signal: AbortSignal.timeout(10000) },
    );
    assert(
      z
        .object({
          ok: z.literal(false),
          error: z.object({ kind: z.literal('provider'), status: z.literal(429) }),
        })
        .safeParse(result).success,
    );
    assert.equal(dispatches, 1);
  } finally {
    discovery.close();
  }
  console.log(
    '[pass] provider recovery: owned model deadline reports known quota blocking without another dispatch',
  );

  let networkAttempts = 0;
  globalThis.fetch = async (_url, init) => {
    networkAttempts++;
    if (networkAttempts === 1) return limited();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.throwIfAborted();
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  };
  const timeout = createDiscoveryOperations({ author: { apiKey: 'offline' } });
  try {
    const operation = timeout.operations['result.review'];
    assert(operation);
    const result = await operation.run(
      { ...modelInput, settings: { ...modelInput.settings, maxMs: 80 } },
      { signal: AbortSignal.timeout(10000) },
    );
    assert(
      z
        .object({ ok: z.literal(false), error: z.object({ code: z.literal('MODEL_TIME_LIMIT') }) })
        .safeParse(result).success,
    );
    assert.equal(
      networkAttempts,
      2,
      'An actual new network attempt must clear stale quota attribution',
    );
  } finally {
    timeout.close();
  }
  console.log(
    '[pass] provider recovery: a later connection stall is a model time limit, never a stale quota block',
  );
} finally {
  globalThis.fetch = originalFetch;
}
