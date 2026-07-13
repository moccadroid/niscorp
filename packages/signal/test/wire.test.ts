import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal } from '../src/signal';
import { routeResponse, routeRejection } from '../src/wire/router';
import { failedGeneration, jsonlLines, recoverRejection, resolveWireStrategies } from '../src/wire/strategies';

// The wire contract: what comes out conforms to the schema that went
// in — or is a typed failure with evidence. Repairs are rescue-only
// and gated by the acceptance schema; provider rejections that carry
// the attempt are recovered by registry-selected strategies and routed
// exactly like accepted responses.

const Envelope = z
  .object({
    response: z.string().optional(),
    data: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
    reasoning: z.string().optional(),
  })
  .strict();

const DECLARED = new Set(['query', 'run_action']);
const NO_STRATEGIES: [] = [];

const route = (content: string, toolCalls: Array<{ id: string; name: string; args: unknown }> = []) =>
  routeResponse({ content, toolCalls, declared: DECLARED, accept: Envelope, responseStrategies: NO_STRATEGIES });

describe('routeResponse — the default ladder (every provider)', () => {
  it('clean envelope content → output, untouched at rung "parse"', () => {
    const routed = route('{"data": {"a": 1}, "reasoning": "why"}');
    expect(routed.outcome).toEqual({ kind: 'output', value: { data: { a: 1 }, reasoning: 'why' } });
    expect(routed.wire.rung).toBe('parse');
  });

  it('fenced / prose-wrapped envelopes → output via extract', () => {
    const fenced = route('```json\n{"data": {"a": 1}}\n```');
    expect(fenced.outcome.kind).toBe('output');
    const prose = route('Here you go:\n{"data": {"a": 1}}\nDone!');
    expect(prose.outcome.kind).toBe('output');
  });

  it('stringified NESTED payload (Groq mangling) → output via deep decode', () => {
    const Nested = z.object({ data: z.object({ children: z.array(z.object({ c: z.string() })) }) });
    const routed = routeResponse({
      content: '{"data": {"children": "[{\\"c\\":\\"Text\\"}]"}}',
      toolCalls: [],
      declared: DECLARED,
      accept: Nested,
      responseStrategies: NO_STRATEGIES,
    });
    expect(routed.outcome.kind).toBe('output');
    expect(routed.wire.rung).toContain('deep-decode');
  });

  it('truncated content → output via close-truncated when the rest validates', () => {
    const Loose = z.object({ data: z.record(z.string(), z.unknown()) });
    const routed = routeResponse({
      content: '{"data": {"rows": [1, 2], "loadingO',
      toolCalls: [],
      declared: DECLARED,
      accept: Loose,
      responseStrategies: NO_STRATEGIES,
    });
    expect(routed.outcome).toEqual({ kind: 'output', value: { data: { rows: [1, 2] } } });
    expect(routed.wire.rung).toBe('close-truncated');
  });

  it('declared tool calls pass through as tool_calls; pseudo calls in a mixed turn are dropped with a note', () => {
    const routed = route('', [
      { id: 'c1', name: 'query', args: { intent: 'x' } },
      { id: 'c2', name: 'json', args: { data: {} } },
    ]);
    expect(routed.outcome.kind).toBe('tool_calls');
    if (routed.outcome.kind === 'tool_calls') {
      expect(routed.outcome.calls.map((c) => c.name)).toEqual(['query']);
    }
    expect(routed.wire.notes?.[0]).toContain('"json"');
  });

  it('pseudo-tool fixation: an undeclared call carrying a valid envelope IS the output', () => {
    const routed = route('', [{ id: 'c1', name: 'json', args: { data: { a: 1 }, reasoning: 'done' } }]);
    expect(routed.outcome).toEqual({ kind: 'output', value: { data: { a: 1 }, reasoning: 'done' } });
    expect(routed.wire.notes?.[0]).toContain('undeclared tool "json"');
  });

  it('an invalid attempt fails with the schema evidence, never garbage', () => {
    const routed = route('{"data": "not an object"}');
    expect(routed.outcome.kind).toBe('failed');
    if (routed.outcome.kind === 'failed') expect(routed.outcome.evidence).toContain('data');
  });

  it('a prose turn fails with truncation NOT flagged', () => {
    const routed = route('Let me check the tasks table first.');
    expect(routed.outcome.kind).toBe('failed');
    if (routed.outcome.kind === 'failed') expect(routed.outcome.truncated).toBeUndefined();
  });
});

describe('wire strategies — provider knowledge as registry data', () => {
  const groqError = (failed_generation: string | undefined, code = 'tool_use_failed'): Error =>
    Object.assign(new Error('400'), { error: { code, ...(failed_generation !== undefined && { failed_generation }) } });

  it('failed-generation recovers the parsed call shape', () => {
    const attempt = JSON.stringify({ name: 'json', arguments: { data: { a: 1 } } });
    const recovered = recoverRejection([failedGeneration], groqError(attempt));
    expect(recovered?.strategy).toBe('failed-generation');
    expect(recovered?.rejection.name).toBe('json');
    expect(recovered?.rejection.truncated).toBe(false);
  });

  it('failed-generation recovers the TRUNCATED shape by closing the structure', () => {
    const truncated = '{"name": "run_action", "arguments": {"action": {"id": "view.x", "data": {"a": 1}, "layo';
    const recovered = recoverRejection([failedGeneration], groqError(truncated));
    expect(recovered?.rejection.name).toBe('run_action');
    expect(recovered?.rejection.truncated).toBe(true);
  });

  it('unclaimed errors return nothing (rethrow at the call site)', () => {
    expect(recoverRejection([failedGeneration], Object.assign(new Error('429'), { error: { code: 'rate_limited' } }))).toBeUndefined();
  });

  it('jsonl-lines contributes lines as candidates; the acceptance gate picks', () => {
    const content = '{"progress": "thinking"}\n{"data": {"a": 1}}';
    const routed = routeResponse({
      content,
      toolCalls: [],
      declared: DECLARED,
      accept: Envelope,
      responseStrategies: [jsonlLines],
    });
    expect(routed.outcome).toEqual({ kind: 'output', value: { data: { a: 1 } } });
    expect(routed.wire.rung).toBe('jsonl-lines');
  });

  it('unknown strategy ids throw at resolution, not mid-run', () => {
    expect(() => resolveWireStrategies(['nope'])).toThrow(/Unknown wire strategy/);
  });
});

describe('routeRejection — the 400 carried the payload', () => {
  it('a rejected call to a DECLARED tool becomes a normal tool call', () => {
    const routed = routeRejection(
      { name: 'run_action', args: { action: { id: 'view.x' } }, argsText: '{"action":{"id":"view.x"}}', truncated: false },
      { declared: DECLARED, accept: Envelope, responseStrategies: NO_STRATEGIES },
    );
    expect(routed.outcome.kind).toBe('tool_calls');
    if (routed.outcome.kind === 'tool_calls') {
      expect(routed.outcome.calls[0]?.name).toBe('run_action');
      expect(routed.outcome.calls[0]?.args).toEqual({ action: { id: 'view.x' } });
    }
  });

  it('a rejected pseudo-call carrying a valid envelope finishes as output', () => {
    const routed = routeRejection(
      { name: 'json', args: { data: { a: 1 } }, argsText: '{"data":{"a":1}}', truncated: false },
      { declared: DECLARED, accept: Envelope, responseStrategies: NO_STRATEGIES },
    );
    expect(routed.outcome).toEqual({ kind: 'output', value: { data: { a: 1 } } });
  });

  it('a truncated rejection with nothing salvageable fails WITH the truncated flag', () => {
    const routed = routeRejection(
      { argsText: '{"data": {"a": {"b": {"c":', truncated: true },
      { declared: DECLARED, accept: Envelope, responseStrategies: NO_STRATEGIES },
    );
    expect(routed.outcome.kind).toBe('failed');
    if (routed.outcome.kind === 'failed') expect(routed.outcome.truncated).toBe(true);
  });
});

describe('end to end through step() — the 400 never existed', () => {
  // A fake OpenAI SDK client whose create() throws a Groq-shaped 400.
  const throwingClient = (failed_generation: string) => ({
    chat: {
      completions: {
        create: () =>
          Promise.reject(Object.assign(new Error('400 tool_use_failed'), {
            error: { code: 'tool_use_failed', failed_generation },
          })),
      },
    },
  });

  const TOOLS = [
    { name: 'run_action', description: 'mount', parameters: { type: 'object' } },
    { name: 'query', description: 'read', parameters: { type: 'object' } },
  ];

  it('a mangled run_action 400 arrives as a NORMAL tool call', async () => {
    const attempt = JSON.stringify({
      name: 'run_action',
      // The observed corruption: nested array stringified inside args.
      arguments: { action: { id: 'view.x', layout: { children: '[{"component":"Text"}]' } } },
    });
    const llm = createSignal('groq', { apiKey: 'k', client: throwingClient(attempt) });
    const result = await llm.step({
      messages: [{ role: 'user', content: 'go' }],
      tools: TOOLS,
      output: { accept: Envelope },
    });
    expect(result.finishReason).toBe('error_recovered');
    expect(result.outcome?.kind).toBe('tool_calls');
    expect(result.toolCalls[0]?.name).toBe('run_action');
    expect(result.wire?.recovered).toEqual({ strategy: 'failed-generation', name: 'run_action', truncated: false });
  });

  it('a rejected `json` pseudo-call carrying the envelope finishes as OUTPUT', async () => {
    const attempt = JSON.stringify({ name: 'json', arguments: { data: { a: 1 }, reasoning: 'done' } });
    const llm = createSignal('groq', { apiKey: 'k', client: throwingClient(attempt) });
    const result = await llm.step({
      messages: [{ role: 'user', content: 'go' }],
      tools: TOOLS,
      output: { accept: Envelope },
    });
    expect(result.outcome).toEqual({ kind: 'output', value: { data: { a: 1 }, reasoning: 'done' } });
  });

  it('stepStream recovers the same way and ends with a routed done event', async () => {
    const attempt = JSON.stringify({ name: 'json', arguments: { data: { a: 2 } } });
    const llm = createSignal('groq', { apiKey: 'k', client: throwingClient(attempt) });
    const events = [];
    for await (const event of llm.stepStream({
      messages: [{ role: 'user', content: 'go' }],
      tools: TOOLS,
      output: { accept: Envelope },
    })) {
      events.push(event);
    }
    const done = events.find((event) => event.type === 'done');
    expect(done?.type === 'done' && done.result.outcome).toEqual({ kind: 'output', value: { data: { a: 2 } } });
  });

  it('unclaimed provider errors still throw', async () => {
    const client = {
      chat: { completions: { create: () => Promise.reject(Object.assign(new Error('500'), { error: { code: 'boom' } })) } },
    };
    const llm = createSignal('groq', { apiKey: 'k', client });
    await expect(
      llm.step({ messages: [{ role: 'user', content: 'go' }], output: { accept: Envelope } }),
    ).rejects.toThrow(/Provider error/);
  });
});
