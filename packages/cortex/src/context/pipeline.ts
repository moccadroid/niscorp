// ═══════════════════════════════════════════════════════════
// Context pipeline — gather → build → estimate → compress → pack
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.3. Pure module — no I/O, no side effects, no LLM
// calls (compressors that use LLMs go through the producer's compress
// hook, which the runtime instruments separately).
//
// The pipeline is the heart of Cortex. Tests in test/context/pipeline.test.ts
// are extensive on purpose.

import type { ContentChunk } from '../schemas';
import type {
  BuildContext,
  ContextProducer,
  ResolvedChunk,
  ResolvedContext,
} from './types';
import type { TokenCounter } from './tokens';
import { fuzzyCount } from './tokens';
import { truncateCompressor } from './compressors/truncate.compressor';

export type RunPipelineOptions = {
  budgetTokens: number;
  countTokens?: TokenCounter;
};

type Tagged = ResolvedChunk & {
  producerId: string;
  producerPriority: number;
};

const DEFAULT_PINNED_PRIORITY = 100;

export const runPipeline = async (
  producers: ReadonlyArray<ContextProducer>,
  ctx: BuildContext,
  opts: RunPipelineOptions,
): Promise<ResolvedContext> => {
  const count = opts.countTokens ?? fuzzyCount;
  const budget = Math.max(0, opts.budgetTokens);

  // 1. Gather: stable sort by priority desc, ties broken by registration order.
  const ordered = producers
    .map((producer, index) => ({ producer, index }))
    .sort((a, b) => b.producer.priority - a.producer.priority || a.index - b.index)
    .map((entry) => entry.producer);

  // 2. Build + 3. Estimate (per chunk).
  const all: Tagged[] = [];
  for (const producer of ordered) {
    const out = await producer.build(ctx);

    // Per-producer compression (if maxTokens set).
    let chunks: ContentChunk[] = out;
    if (producer.maxTokens !== undefined) {
      const sized = chunks.map((c) => ({ ...c, tokens: c.tokens ?? count(c) }));
      let totalProducer = 0;
      for (const c of sized) totalProducer += c.tokens ?? 0;
      if (totalProducer > producer.maxTokens) {
        const compressor = producer.compress ?? truncateCompressor;
        chunks = await compressor(sized, producer.maxTokens);
      } else {
        chunks = sized;
      }
    } else {
      chunks = chunks.map((c) => ({ ...c, tokens: c.tokens ?? count(c) }));
    }

    for (const chunk of chunks) {
      all.push({
        ...chunk,
        evicted: false,
        producerId: producer.id,
        producerPriority: producer.priority,
      });
    }
  }

  // 4. Compress globally — sort by priority asc (least important first)
  // and evict until under budget. Pinned chunks (priority=100) are
  // never evicted, regardless of budget overrun.
  let total = 0;
  for (const chunk of all) total += chunk.tokens ?? 0;

  if (total > budget) {
    // Eviction order: lower priority first; within same priority, later
    // (toward the tail) first so the prefix stays cache-stable.
    const evictionOrder = all
      .map((chunk, index) => ({ chunk, index }))
      .filter(
        ({ chunk }) =>
          chunk.producerPriority < DEFAULT_PINNED_PRIORITY &&
          chunk.evictable !== false,
      )
      .sort((a, b) => a.chunk.producerPriority - b.chunk.producerPriority || b.index - a.index);

    for (const candidate of evictionOrder) {
      if (total <= budget) break;
      candidate.chunk.evicted = true;
      candidate.chunk.reason = 'budget';
      total -= candidate.chunk.tokens ?? 0;
    }
  }

  // 5. Strip the tagging metadata from the result; preserve order.
  const resolved: ResolvedChunk[] = all.map((chunk) => ({
    role: chunk.role,
    content: chunk.content,
    tokens: chunk.tokens,
    evictable: chunk.evictable,
    tags: chunk.tags,
    source: chunk.source,
    evicted: chunk.evicted,
    reason: chunk.reason,
  }));

  return {
    chunks: resolved,
    totalTokens: total,
    budget,
  };
};
