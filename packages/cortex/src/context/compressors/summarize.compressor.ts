// ═══════════════════════════════════════════════════════════
// summarize compressor — LLM-based, opt-in
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.6. This compressor calls a (small/fast) model
// to summarize chunks that exceed the producer's maxTokens budget.
//
// Usage:
//   historyProducer({
//     maxTokens: 2000,
//     compress: createSummarizeCompressor({ llm }),
//   });

import type { ContentChunk } from '../../schemas';
import type { Compressor } from '../types';
import type { SignalClient } from '../../llm/signal-client';
import { fuzzyCount } from '../tokens';

export type SummarizeCompressorOptions = {
  llm: SignalClient;
};

export const createSummarizeCompressor = (options: SummarizeCompressorOptions): Compressor =>
  async (chunks, targetTokens) => {
    if (targetTokens <= 0) return [];
    if (chunks.length === 0) return [];

    const text = chunks
      .map((c) => (typeof c.content === 'string' ? c.content : JSON.stringify(c.content)))
      .join('\n\n');

    const currentTokens = chunks.reduce((sum, c) => sum + (c.tokens ?? fuzzyCount(c)), 0);
    if (currentTokens <= targetTokens) return chunks.slice();

    // ~0.75 words per token is a rough heuristic for English text.
    const targetWords = Math.max(20, Math.round(targetTokens * 0.75));

    const result = await options.llm.step({
      messages: [
        {
          role: 'system',
          content: `Summarize the following text in approximately ${targetWords} words. Preserve key facts, decisions, and outcomes. Return only the summary, no preamble.`,
        },
        { role: 'user', content: text },
      ],
    });

    const summary: ContentChunk = {
      role: chunks[0]?.role ?? 'system',
      content: result.content,
      source: chunks[0]?.source ?? 'cortex.summarize',
      tags: ['summarized'],
    };

    return [summary];
  };
