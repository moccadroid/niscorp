import { describe, it, expect } from 'vitest';
import type { SignalClient } from '@niscorp/cortex';
import { routeResponse, type StepRequest, type StepResult } from '@niscorp/signal';
import { compile, execute, type JsonObject } from '@niscorp/prism';
import { createShapeMapper, rowsFitShape } from '../../src/agent/index.js';

describe('rowsFitShape', () => {
  it('fits a flat array shape whose keys and kinds the rows already have', () => {
    expect(rowsFitShape([{ name: 'Ada', count: 3 }], [{ name: '', count: 0 }])).toBe(true);
  });

  it('fits a single shape against the first row, and takes null for any kind', () => {
    expect(rowsFitShape([{ value: 40 }], { value: 0 })).toBe(true);
    expect(rowsFitShape([{ name: null, count: 3 }], [{ name: '', count: 0 }])).toBe(true);
  });

  it('does not fit a missing, extra or renamed column', () => {
    expect(rowsFitShape([{ name: 'Ada' }], [{ name: '', count: 0 }])).toBe(false);
    expect(rowsFitShape([{ name: 'Ada', count: 3, id: 'x' }], [{ name: '', count: 0 }])).toBe(false);
    expect(rowsFitShape([{ peopleCount: 40 }], { value: 0 })).toBe(false);
  });

  it('does not fit a value of another kind — a count that came back as text maps', () => {
    expect(rowsFitShape([{ value: '40' }], { value: 0 })).toBe(false);
  });

  it('does not fit a nested shape', () => {
    expect(rowsFitShape([{ person: 'Ada' }], [{ person: { name: '' } }])).toBe(false);
  });

  it('does not fit no rows: there is nothing to prove the columns by', () => {
    expect(rowsFitShape([], [{ name: '' }])).toBe(false);
  });
});

describe('createShapeMapper', () => {
  const called = (): never => {
    throw new Error('the model was called');
  };
  const untouchable: SignalClient = { step: called, stepStream: called, count: called, describe: called };

  it('writes the mapping again, told why, when the first one does not run on the rows', async () => {
    const answers = ['{"data":{"$ref":"$.nowhere"}}', '{"data":{"$ref":"$.result"}}'];
    const asked: string[] = [];
    const answer = (request: StepRequest): StepResult => {
      asked.push(JSON.stringify(request));
      const base: StepResult = { content: answers[asked.length - 1] ?? '', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, reported: true }, finishReason: 'stop', raw: null };
      if (request.output === undefined) return base;
      const routed = routeResponse({ content: base.content, toolCalls: [], declared: new Set(), accept: request.output.accept, responseStrategies: [] });
      return { ...base, outcome: routed.outcome, wire: routed.wire };
    };
    const llm: SignalClient = {
      step: async (request) => answer(request),
      stepStream: (request) => {
        const result = answer(request);
        return (async function* () {
          yield { type: 'text' as const, text: result.content };
          yield { type: 'done' as const, result };
        })();
      },
      count: async () => 1,
      describe: () => ({
        provider: 'stub',
        model: 'stub-model',
        kind: 'chat',
        modelKnown: false,
        capabilities: {
          nativeTools: true,
          nativeJsonSchema: false,
          nativeJsonMode: true,
          toolsWithStructuredOutput: false,
          validatesToolArgs: true,
          manglesNestedToolArgs: false,
          multimodal: false,
          supportsEmbedding: false,
        },
      }),
    };
    const rows = [{ name: 'Ada' }];
    const { transformed } = await createShapeMapper(llm)(rows, [{ label: '' }], 'every name');
    expect(transformed).toEqual(rows);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain('Your last config failed on these rows');
  });

  it('hands the mapping model the request the rows answer', async () => {
    const asked: string[] = [];
    const recording = (request: unknown): never => {
      asked.push(JSON.stringify(request));
      throw new Error('no answer here');
    };
    const llm: SignalClient = {
      step: recording,
      stepStream: recording,
      count: called,
      describe: () => ({
        provider: 'stub',
        model: 'stub-model',
        kind: 'chat',
        modelKnown: false,
        capabilities: {
          nativeTools: true,
          nativeJsonSchema: false,
          nativeJsonMode: true,
          toolsWithStructuredOutput: false,
          validatesToolArgs: false,
          manglesNestedToolArgs: false,
          multimodal: false,
          supportsEmbedding: false,
        },
      }),
    };
    await expect(createShapeMapper(llm)([{ value: 247000 }], [{ value_display: '' }], 'value formatted as money, like $247K')).rejects.toThrow();
    expect(asked.length).toBeGreaterThan(0);
    expect(asked[0]).toContain('value formatted as money, like $247K');
  });

  it('maps a flat shape the rows carry with no model call', async () => {
    const rows = [{ when: '2026-10-18 13:00:00+01', subject: 'Call' }];
    const { transformed } = await createShapeMapper(untouchable)(rows, [{ when: '' }], 'when it happened');
    expect(transformed).toEqual([{ when: '2026-10-18 13:00:00+01' }]);
    const single = await createShapeMapper(untouchable)([{ open: 5 }], { open: 0 });
    expect(single.transformed).toEqual({ open: 5 });
  });

  it('computes a declared field from the stored one, with no model call, and the mapping replays on other rows', async () => {
    const shape = [{ id: '', close_date: '', close_date_display: { $date: { value: { $ref: '$.close_date' }, format: 'MMM D' } } }];
    const { transformed, ir } = await createShapeMapper(untouchable)([{ id: 'd1', close_date: '2026-06-08', title: 'x' }], shape);
    expect(transformed).toEqual([{ id: 'd1', close_date: '2026-06-08', close_date_display: 'Jun 8' }]);
    const replayed = execute(ir, { result: [{ id: 'd2', close_date: '2026-07-01' }], context: {}, scope: {} } as unknown as JsonObject);
    expect(replayed).toEqual([{ id: 'd2', close_date: '2026-07-01', close_date_display: 'Jul 1' }]);
    expect(await compile(shape[0]?.close_date_display ?? {})).toBeDefined();
  });

  it('leaves to the agent a field the rows lack, such as a form shown only by example', async () => {
    await expect(createShapeMapper(untouchable)([{ close_date: '2026-06-08' }], [{ close_date: '', close_date_display: 'Apr 6' }])).rejects.toThrow('the model was called');
    await expect(createShapeMapper(untouchable)([{ id: 'd1' }], [{ id: '', title: '' }])).rejects.toThrow('the model was called');
  });

  it('leaves to the agent a value of another kind than its example — a count that came back as text', async () => {
    await expect(createShapeMapper(untouchable)([{ value: '40' }], { value: 0 })).rejects.toThrow('the model was called');
  });

});
