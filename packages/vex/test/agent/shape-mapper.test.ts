import { describe, it, expect } from 'vitest';
import type { SignalClient } from '@niscorp/cortex';
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

    asked.length = 0;
    const fitting = [{ when: '2026-10-18 13:00:00+01' }];
    await expect(createShapeMapper(llm)(fitting, [{ when: '' }], 'when it happened, like 2h ago')).rejects.toThrow();
    expect(asked[0]).toContain('when it happened, like 2h ago');
  });

});
