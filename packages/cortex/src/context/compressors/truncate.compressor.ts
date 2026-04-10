// ═══════════════════════════════════════════════════════════
// Truncate compressor — the default, free, no-LLM compressor
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.6: drops oldest / lowest-priority chunks until
// the total token count is at or below targetTokens. Pinned chunks
// (priority=100) are preserved by the global pack step, but at the
// per-producer level we don't know priority — that's a producer-level
// concern. The truncate compressor here only cares about ordering
// within the producer's output.
//
// Strategy: drop from the front of the list (oldest first), keeping
// the most recent chunks. Producers that need different semantics
// (drop from the back, drop by tag, etc.) can ship their own
// compressor.

import type { ContentChunk } from '../../schemas';
import type { Compressor } from '../types';
import { fuzzyCount } from '../tokens';

export const truncateCompressor: Compressor = async (chunks, targetTokens) => {
  if (targetTokens <= 0) return [];
  let total = 0;
  for (const chunk of chunks) total += chunk.tokens ?? fuzzyCount(chunk);
  if (total <= targetTokens) return chunks.slice();

  // Drop from the front until under budget.
  const result: ContentChunk[] = chunks.slice();
  while (result.length > 0 && total > targetTokens) {
    const dropped = result.shift();
    if (!dropped) break;
    total -= dropped.tokens ?? fuzzyCount(dropped);
  }
  return result;
};
