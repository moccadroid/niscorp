import { createServer, type IncomingMessage, type Server } from 'node:http';
import { describe, it, expect, expectTypeOf, afterEach } from 'vitest';
import { createSignal, SignalError, ErrorCode, providerRegistry } from '../src';

// ═══════════════════════════════════════════════════════════
// A fake decision provider, by base URL
// ═══════════════════════════════════════════════════════════
//
// A real HTTP server speaking the System One wire with a canned body, so the
// genuine adapter does the fetch, the auth header and the parsing. `reply`
// decides what comes back; `never` leaves the request hanging for the abort test.

type Seen = { url: string | undefined; authorization: string | undefined; body: unknown };
type Reply = { status?: number; body: unknown } | 'never';

const servers: Server[] = [];

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const fakeProvider = async (reply: Reply): Promise<{ baseUrl: string; seen: Seen[]; closed: Promise<void> }> => {
  const seen: Seen[] = [];
  let markClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => { markClosed = resolve; });
  const server = createServer((request, response) => {
    request.on('close', markClosed);
    void readBody(request).then((body) => {
      seen.push({ url: request.url, authorization: request.headers.authorization, body });
      if (reply === 'never') return;
      response.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fake provider did not bind a port');
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, seen, closed };
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  })));
});

const decider = (baseUrl: string) =>
  createSignal({ baseUrl, apiKey: 'test-key', model: 'jev-test', adapter: 'systemone' });

const QUESTIONS = {
  intent: {
    type: 'choice',
    instructions: 'What is the customer asking for?',
    criteria: { refund: 'Money back', bug: 'A defect report', other: 'Anything else' },
  },
  needsHuman: { type: 'noul', instructions: 'Does this need a person?' },
  urgency: { type: 'score', instructions: 'How urgent is it?', criteria: ['Low', 'Medium', 'High'] },
} as const;

const ANSWERS = {
  intent: { type: 'choice', choice: 'refund', probabilities: { refund: 0.88, bug: 0.12, other: 0 }, confidence: 0.82 },
  needsHuman: { type: 'noul', noul: 0.95 },
  urgency: {
    type: 'score',
    score: 1.05,
    legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
    probabilities: { '0': 0, '1': 0.95, '2': 0.05 },
    confidence: 0.92,
  },
};

const STATE = { message: 'I was charged twice for order 7429', verified: true };

const rejection = async (run: Promise<unknown>): Promise<SignalError> => {
  const error = await run.then(() => undefined, (caught: unknown) => caught);
  if (!(error instanceof SignalError)) throw new Error('expected a SignalError');
  return error;
};

describe('decide() on a decision provider', () => {
  it('round-trips all three question types over the wire', async () => {
    const provider = await fakeProvider({
      body: { model: 'jev-1.13.0', answers: ANSWERS, usage: { input_tokens: 212, output_tokens: 0 } },
    });
    const result = await decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS });

    expect(provider.seen).toEqual([
      { url: '/v1/systemone', authorization: 'Bearer test-key', body: { model: 'jev-test', state: STATE, questions: QUESTIONS } },
    ]);
    expect(result.calibrated).toBe(true);
    expect(result.decisions).toEqual({
      intent: { choice: 'refund', probabilities: { refund: 0.88, bug: 0.12, other: 0 }, confidence: 0.82 },
      needsHuman: { answer: true, noul: 0.95 },
      urgency: { level: 1, score: 1.05, probabilities: [0, 0.95, 0.05], confidence: 0.92 },
    });
    expect(result.meta.model).toBe('jev-1.13.0');
    expect(result.meta.usage).toEqual({ inputTokens: 212, outputTokens: 0, totalTokens: 212, reported: true });
    expect(result.meta.provider.raw).toEqual({ model: 'jev-1.13.0', answers: ANSWERS, usage: { input_tokens: 212, output_tokens: 0 } });
  });

  it('derives the result type from the questions', async () => {
    const provider = await fakeProvider({ body: { answers: ANSWERS } });
    const result = await decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS });

    expectTypeOf(result.decisions.intent.choice).toEqualTypeOf<'refund' | 'bug' | 'other'>();
    expectTypeOf(result.decisions.urgency.level).toEqualTypeOf<number>();
    expectTypeOf(result.decisions.needsHuman.answer).toEqualTypeOf<boolean>();
    if (result.calibrated) {
      expectTypeOf(result.decisions.intent.probabilities).toEqualTypeOf<Record<'refund' | 'bug' | 'other', number>>();
      expectTypeOf(result.decisions.urgency.probabilities).toEqualTypeOf<number[]>();
      expectTypeOf(result.decisions.needsHuman.noul).toEqualTypeOf<number>();
    }
  });

  it('marks usage unreported when the provider sends none', async () => {
    const provider = await fakeProvider({ body: { answers: ANSWERS } });
    const result = await decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS });
    expect(result.meta.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false });
    expect(result.meta.model).toBe('jev-test');
  });

  it.each([
    ['a choice outside the asked options', { ...ANSWERS, intent: { ...ANSWERS.intent, choice: 'chargeback' } }, 'intent.choice'],
    ['a question left unanswered', { intent: ANSWERS.intent, urgency: ANSWERS.urgency }, 'needsHuman: not answered'],
    [
      'a distribution over foreign keys',
      { ...ANSWERS, intent: { ...ANSWERS.intent, probabilities: { refund: 0.5, chargeback: 0.5 } } },
      'intent.probabilities',
    ],
    ['a score past the last level', { ...ANSWERS, urgency: { ...ANSWERS.urgency, score: 3 } }, 'urgency.score'],
    ['a probability above one', { ...ANSWERS, needsHuman: { type: 'noul', noul: 1.4 } }, 'needsHuman.noul'],
  ])('rejects %s, with the body as evidence', async (_case, answers, issue) => {
    const body = { answers };
    const provider = await fakeProvider({ body });
    const error = await rejection(decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS }));
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.message).toContain(issue);
    expect(error.context?.['raw']).toEqual(body);
  });

  it('rejects a body that is not the protocol at all', async () => {
    const provider = await fakeProvider({ body: ['not', 'an', 'object'] });
    const error = await rejection(decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS }));
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.context?.['raw']).toEqual(['not', 'an', 'object']);
  });

  it('surfaces a provider refusal with its status and body', async () => {
    const provider = await fakeProvider({ status: 422, body: { error: 'questions.intent.criteria: too many options' } });
    const error = await rejection(decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS }));
    expect(error.code).toBe(ErrorCode.PROVIDER_ERROR);
    expect(error.context?.['raw']).toEqual({ status: 422, body: { error: 'questions.intent.criteria: too many options' } });
  });

  it('tears the request down on abort', async () => {
    const provider = await fakeProvider('never');
    const controller = new AbortController();
    const pending = decider(provider.baseUrl).decide({ state: STATE, questions: QUESTIONS, options: { signal: controller.signal } });
    const settled = rejection(pending);
    while (provider.seen.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    expect((await settled).code).toBe(ErrorCode.PROVIDER_ERROR);
    await provider.closed;
  });

  it('refuses unanswerable questions before the network', async () => {
    const provider = await fakeProvider({ body: { answers: {} } });
    const signal = decider(provider.baseUrl);
    expect((await rejection(signal.decide({ state: STATE, questions: {} }))).code).toBe(ErrorCode.VALIDATION_FAILED);
    const optionless = { pick: { type: 'choice', instructions: 'Which?', criteria: {} } } as const;
    expect((await rejection(signal.decide({ state: STATE, questions: optionless }))).code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(provider.seen).toEqual([]);
  });
});

describe('a decision provider has decide() and nothing else', () => {
  it('describes itself as a decision provider without touching the network', () => {
    expect(createSignal('typesafe').describe()).toMatchObject({ provider: 'typesafe', model: 'jev-latest', kind: 'decisions' });
    expect(createSignal('openai').describe().kind).toBe('chat');
    expect(providerRegistry['typesafe']).toMatchObject({ adapter: 'systemone', envKey: 'TYPESAFE_API_KEY' });
  });

  it('fails the chat verbs by name', async () => {
    const provider = await fakeProvider({ body: { answers: ANSWERS } });
    const signal = decider(provider.baseUrl);
    const failures = await Promise.all([
      rejection(signal.complete('hello')),
      rejection(signal.step({ messages: [{ role: 'user', content: 'hello' }] })),
      rejection(signal.embed('hello')),
    ]);
    for (const error of failures) expect(error.code).toBe(ErrorCode.VERB_NOT_SUPPORTED);
    expect(provider.seen).toEqual([]);
  });
});

describe('decide() emulated on a chat provider', () => {
  const chatSignal = (content: string) =>
    createSignal(
      { baseUrl: 'https://fake.api.com/v1', apiKey: 'test-key', model: 'text-model', adapter: 'openai-compatible' },
      {
        client: {
          chat: {
            completions: {
              create: async () => (async function* () {
                yield { choices: [{ delta: { content } }] };
                yield { choices: [{ finish_reason: 'stop' }] };
              })(),
            },
          },
        },
      },
    );

  it('returns the same decisions as picks alone, uncalibrated', async () => {
    const result = await chatSignal(JSON.stringify({ intent: 'refund', needsHuman: true, urgency: 1 }))
      .decide({ state: STATE, questions: QUESTIONS });

    expect(result.calibrated).toBe(false);
    expect(result.decisions).toEqual({ intent: { choice: 'refund' }, needsHuman: { answer: true }, urgency: { level: 1 } });
    expect(result.meta.model).toBe('text-model');
    expect(result.meta.usage.reported).toBe(false);
  });

  it('holds the text model to the asked options', async () => {
    const signal = chatSignal(JSON.stringify({ intent: 'chargeback', needsHuman: true, urgency: 1 })).retries(0);
    await expect(signal.decide({ state: STATE, questions: QUESTIONS })).rejects.toBeInstanceOf(SignalError);
  });
});
