import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runStream, runComplete, type RunDeps } from '../src/run';
import type { Capabilities, Message, StepResult, StepStreamEvent, StreamEvent, Tool } from '../src/types';
import { routeResponse } from '../src/wire/router';

// The high-level loop's behavioral spec — text deltas, tool execution,
// schema retries, done/error events — driven through a scripted step
// core that routes exactly like production (same router).

const CAPS: Capabilities = {
  nativeTools: true,
  nativeJsonSchema: false,
  nativeJsonMode: true,
  toolsWithStructuredOutput: false,
  validatesToolArgs: false,
  manglesNestedToolArgs: false,
  multimodal: false,
  supportsEmbedding: false,
};

type Turn = { text?: string[]; toolCalls?: Array<{ id: string; name: string; args: unknown }> };

const scripted = (turns: Turn[]): RunDeps => {
  let cursor = 0;
  return {
    model: 'stub-model',
    capabilities: CAPS,
    stepStream: (request) => {
      const turn = turns[cursor];
      cursor += 1;
      if (!turn) throw new Error(`script exhausted after ${turns.length} turn(s)`);
      return (async function* (): AsyncGenerator<StepStreamEvent> {
        for (const chunk of turn.text ?? []) yield { type: 'text', text: chunk };
        const base: StepResult = {
          content: (turn.text ?? []).join(''),
          toolCalls: (turn.toolCalls ?? []).map((call) => ({ ...call })),
          // `reported: true` — this mock IS stating a cost. Leaving it off made
          // the double say "the provider told us nothing", which is the exact
          // confusion the flag was added to end.
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reported: true },
          finishReason: (turn.toolCalls?.length ?? 0) > 0 ? 'tool_calls' : 'stop',
          raw: null,
        };
        if (!request.output) {
          yield { type: 'done', result: base };
          return;
        }
        const routed = routeResponse({
          content: base.content,
          toolCalls: base.toolCalls,
          declared: new Set((request.tools ?? []).map((tool) => tool.name)),
          accept: request.output.accept,
          responseStrategies: [],
        });
        yield { type: 'done', result: { ...base, outcome: routed.outcome, wire: routed.wire } };
      })();
    },
  };
};

const USER: Message[] = [{ role: 'user', content: 'go' }];

const collect = async <T>(events: AsyncIterable<StreamEvent<T>>): Promise<StreamEvent<T>[]> => {
  const out: StreamEvent<T>[] = [];
  for await (const event of events) out.push(event);
  return out;
};

describe('runStream', () => {
  it('yields text deltas and a done event with history', async () => {
    const deps = scripted([{ text: ['Hel', 'lo'] }]);
    const events = await collect(runStream<string>({ messages: USER, retries: 2 }, deps));

    const texts = events.flatMap((event) => (event.type === 'text' ? [event.text] : []));
    expect(texts).toEqual(['Hel', 'lo']);
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.response).toBe('Hello');
      expect(done.history.at(-1)).toEqual({ role: 'assistant', content: 'Hello' });
      expect(done.meta.usage.totalTokens).toBe(15);
    }
  });

  it('yields done with the parsed response when a schema validates', async () => {
    const Schema = z.object({ answer: z.number() });
    const deps = scripted([{ text: ['{"answer": 7}'] }]);
    const events = await collect(runStream<{ answer: number }>({ messages: USER, schema: Schema, retries: 2 }, deps));
    const done = events.at(-1);
    expect(done?.type === 'done' && done.response).toEqual({ answer: 7 });
  });

  it('emits retry, corrects in-run, and re-streams on validation failure', async () => {
    const Schema = z.object({ answer: z.number() });
    const onRetry = vi.fn();
    const deps = scripted([{ text: ['{"answer": "seven"}'] }, { text: ['{"answer": 7}'] }]);
    const events = await collect(
      runStream<{ answer: number }>({ messages: USER, schema: Schema, retries: 2, onRetry }, deps),
    );

    expect(events.some((event) => event.type === 'retry' && event.attempt === 1)).toBe(true);
    expect(onRetry).toHaveBeenCalledTimes(1);
    const done = events.at(-1);
    expect(done?.type === 'done' && done.response).toEqual({ answer: 7 });
    // The correction rode the transcript, not a re-run.
    if (done?.type === 'done') {
      expect(
        done.history.some(
          (message) => message.role === 'system' && typeof message.content === 'string' && message.content.includes('invalid'),
        ),
      ).toBe(true);
    }
  });

  it('emits error (not done) when retries are exhausted', async () => {
    const Schema = z.object({ answer: z.number() });
    const deps = scripted([{ text: ['nope'] }, { text: ['still nope'] }]);
    const events = await collect(runStream<{ answer: number }>({ messages: USER, schema: Schema, retries: 1 }, deps));
    const last = events.at(-1);
    expect(last?.type).toBe('error');
    expect(events.some((event) => event.type === 'done')).toBe(false);
  });

  it('executes tools between turns with tool_start/tool_end and records', async () => {
    const add: Tool = {
      name: 'add',
      description: 'adds',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: (input) => {
        const { a, b } = input as { a: number; b: number };
        return a + b;
      },
    };
    const onToolCall = vi.fn();
    const deps = scripted([
      { toolCalls: [{ id: 'c1', name: 'add', args: { a: 2, b: 3 } }] },
      { text: ['5 it is'] },
    ]);
    const events = await collect(runStream<string>({ messages: USER, tools: [add], retries: 2, onToolCall }, deps));

    expect(events.some((event) => event.type === 'tool_start' && event.name === 'add')).toBe(true);
    expect(events.some((event) => event.type === 'tool_end' && event.result === 5)).toBe(true);
    expect(onToolCall).toHaveBeenCalledWith('add', { a: 2, b: 3 });
    const done = events.at(-1);
    expect(done?.type === 'done' && done.meta.toolCalls[0]?.result).toBe(5);
  });

  it('throws when tools are requested on a provider without native tool calling', async () => {
    const noTools = { ...scripted([]), capabilities: { ...CAPS, nativeTools: false } };
    const tool: Tool = { name: 't', description: 'd', inputSchema: z.object({}), execute: () => 'x' };
    await expect(collect(runStream({ messages: USER, tools: [tool], retries: 0 }, noTools))).rejects.toThrow(/native tool/);
  });
});

describe('runComplete', () => {
  it('drains the stream and returns the result', async () => {
    const deps = scripted([{ text: ['plain'] }]);
    const result = await runComplete<string>({ messages: USER, retries: 2 }, deps);
    expect(result.response).toBe('plain');
    expect(result.meta.retries).toBe(0);
  });

  it('throws the validation error when retries are exhausted', async () => {
    const Schema = z.object({ answer: z.number() });
    const deps = scripted([{ text: ['nope'] }]);
    await expect(runComplete({ messages: USER, schema: Schema, retries: 0 }, deps)).rejects.toThrow(/schema validation/);
  });
});
