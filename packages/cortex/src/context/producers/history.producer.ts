// ═══════════════════════════════════════════════════════════
// historyProducer — bounded conversation history window
// ═══════════════════════════════════════════════════════════
//
// In v1, history is read from a single state-store key
// `cortex.history` (an array of { role, content } messages).
// The producer takes the last N messages and emits them as
// chunks. Compression hooks may shrink it further.

import type { ContentChunk } from '../../schemas';
import type { Compressor, ContextProducer } from '../types';

export type HistoryEntry = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type HistoryProducerOptions = {
  window?: number;
  stateKey?: string;
  compress?: Compressor;
};

const isHistoryEntry = (value: unknown): value is HistoryEntry => {
  if (!value || typeof value !== 'object') return false;
  const v = value as { role?: unknown; content?: unknown };
  return (
    (v.role === 'user' || v.role === 'assistant' || v.role === 'system') &&
    typeof v.content === 'string'
  );
};

export const historyProducer = (options: HistoryProducerOptions = {}): ContextProducer => {
  const stateKey = options.stateKey ?? 'cortex.history';
  const window = options.window ?? 20;
  return {
    id: 'cortex.history',
    priority: 50,
    ...(options.compress && { compress: options.compress }),
    build: ({ state }) => {
      const raw = state.get(stateKey);
      if (!Array.isArray(raw)) return [];
      const valid = raw.filter(isHistoryEntry);
      const recent = valid.slice(-window);
      const chunks: ContentChunk[] = recent.map((entry) => ({
        role: entry.role,
        content: entry.content,
        source: 'cortex.history',
        tags: ['history'],
      }));
      return chunks;
    },
  };
};
