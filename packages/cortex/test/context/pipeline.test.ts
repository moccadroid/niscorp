import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/context/pipeline';
import { fuzzyCount } from '../../src/context/tokens';
import type { BuildContext, ContextProducer, ReadonlyRegistry } from '../../src/context/types';

const emptyRegistry: ReadonlyRegistry = {
  listAgents: () => [],
  listTools: () => [],
  getAgent: () => undefined,
  getTool: () => undefined,
};

const ctx: BuildContext = {
  agentId: 'a',
  workflowId: 'wf',
  tick: 0,
  input: 'hello',
  observations: [],
  registry: emptyRegistry,
  state: new Map(),
  budget: { tokensUsed: 0, tokensRemaining: 10_000, ticksUsed: 0, ticksRemaining: 10, toolCallsUsed: 0 },
};

const literal = (id: string, priority: number, content: string): ContextProducer => ({
  id,
  priority,
  build: () => [{ role: 'system', content, source: id }],
});

describe('runPipeline', () => {
  it('builds chunks from all producers in priority-desc order', async () => {
    const result = await runPipeline(
      [literal('low', 10, 'low chunk'), literal('high', 100, 'high chunk'), literal('mid', 50, 'mid chunk')],
      ctx,
      { budgetTokens: 10_000 },
    );
    const sources = result.chunks.map((c) => c.source);
    expect(sources).toEqual(['high', 'mid', 'low']);
    expect(result.chunks.every((c) => !c.evicted)).toBe(true);
  });

  it('evicts the lowest-priority chunks first when over budget', async () => {
    const big = (id: string, priority: number): ContextProducer => ({
      id,
      priority,
      build: () => [{ role: 'system', content: 'x'.repeat(400), source: id }],
    });
    const result = await runPipeline(
      [big('keep', 100), big('drop', 10), big('mid', 50)],
      ctx,
      { budgetTokens: 130 }, // ~100 tokens per chunk + 4 overhead
    );
    const evicted = result.chunks.filter((c) => c.evicted).map((c) => c.source);
    expect(evicted).toContain('drop');
    expect(evicted).not.toContain('keep'); // pinned at priority 100
  });

  it('never evicts pinned chunks (priority=100) even if over budget', async () => {
    const result = await runPipeline(
      [literal('pinned', 100, 'x'.repeat(1000))],
      ctx,
      { budgetTokens: 10 },
    );
    const pinned = result.chunks.find((c) => c.source === 'pinned');
    expect(pinned).toBeDefined();
    expect(pinned?.evicted).toBe(false);
  });

  it('respects per-producer maxTokens via the producer compress hook', async () => {
    const producer: ContextProducer = {
      id: 'noisy',
      priority: 50,
      maxTokens: 30,
      build: () => [
        { role: 'system', content: 'x'.repeat(400), source: 'noisy' },
        { role: 'system', content: 'y'.repeat(400), source: 'noisy' },
      ],
    };
    const result = await runPipeline([producer], ctx, { budgetTokens: 10_000 });
    // After truncate (default), the producer's contribution should be at or below 30.
    let total = 0;
    for (const c of result.chunks) total += c.tokens ?? 0;
    expect(total).toBeLessThanOrEqual(30);
  });

  it('preserves the source field on every chunk', async () => {
    const result = await runPipeline(
      [literal('a', 100, 'aa'), literal('b', 90, 'bb')],
      ctx,
      { budgetTokens: 10_000 },
    );
    expect(result.chunks.every((c) => typeof c.source === 'string' && c.source.length > 0)).toBe(true);
  });

  it('fills in tokens via the configured counter', async () => {
    const result = await runPipeline([literal('a', 100, 'hello')], ctx, {
      budgetTokens: 10_000,
      countTokens: fuzzyCount,
    });
    expect(result.chunks[0]?.tokens).toBeGreaterThan(0);
  });
});
