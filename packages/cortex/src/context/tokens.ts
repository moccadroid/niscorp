// ═══════════════════════════════════════════════════════════
// Token estimation
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.8: two modes — fuzzy (heuristic, hot path) and
// exact (delegates to signal.count(), not yet implemented upstream).
//
// Fuzzy is the default. The heuristic is ~4 characters per token,
// which is roughly correct for English text and roughly wrong for
// code and structured JSON. Good enough to answer "are we at 10k or
// 100k?" — see DESIGN.md §round-3 user feedback.

import type { ContentChunk, ContentPart } from '../schemas';

export type TokenEstimationMode = 'fuzzy' | 'exact';

export type TokenCounter = (chunk: ContentChunk) => number;

const CHARS_PER_TOKEN = 4;

const stringifyContent = (content: string | ContentPart[]): string => {
  if (typeof content === 'string') return content;
  // For multi-part content, count text parts directly and assign a
  // flat budget to image parts (very rough — images are not free but
  // their token cost is provider-specific).
  let s = '';
  for (const part of content) {
    if (part.type === 'text') {
      s += part.text;
    } else {
      // Image: charge ~256 tokens worth of characters as a placeholder.
      s += ' '.repeat(256 * CHARS_PER_TOKEN);
    }
  }
  return s;
};

export const fuzzyCount: TokenCounter = (chunk) => {
  const text = stringifyContent(chunk.content);
  // Add 4 tokens of role / formatting overhead per chunk — same
  // ballpark as OpenAI's per-message cost.
  return Math.ceil(text.length / CHARS_PER_TOKEN) + 4;
};

// Placeholder for exact counting. Until signal.count() lands upstream,
// exact mode falls back to fuzzy. The pipeline still respects the
// configured mode so swapping in the real implementation is a one-line
// change here.
export const exactCount: TokenCounter = (chunk) => fuzzyCount(chunk);

export const counterFor = (mode: TokenEstimationMode): TokenCounter =>
  mode === 'exact' ? exactCount : fuzzyCount;
