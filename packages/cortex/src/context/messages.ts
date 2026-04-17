// ═══════════════════════════════════════════════════════════
// Convert ResolvedContext chunks → LLM messages
// ═══════════════════════════════════════════════════════════
//
// The pipeline produces ResolvedContext (chunks with eviction
// decisions). The tool loop sends a flat message list to signal.step().
// This module bridges the two.
//
// Eviction policy:
//   - Evicted chunks are dropped from the message list entirely.
//   - Non-evictable system chunks at priority 100 always survive.
//   - The order is preserved from the pipeline output.
//
// The pipeline produces multiple system/user/assistant chunks. We
// concatenate same-role consecutive chunks into single messages so
// the provider sees a clean conversation rather than 8 system blocks.

import type { ResolvedContext } from './types';
import type { Message } from '@niscorp/signal';
import type { ContentChunk } from '../schemas';

const stringifyChunkContent = (chunk: ContentChunk): string => {
  if (typeof chunk.content === 'string') return chunk.content;
  // Multipart content: flatten text parts. Image parts are kept as
  // text placeholders since the message-flattening here targets
  // providers without multipart input. Future: pass multipart through.
  return chunk.content
    .map((p) => (p.type === 'text' ? p.text : '[image]'))
    .join('');
};

export const toLlmMessages = (resolved: ResolvedContext): Message[] => {
  const surviving = resolved.chunks.filter((c) => !c.evicted);
  if (surviving.length === 0) return [];

  const messages: Message[] = [];
  let currentRole: 'system' | 'user' | 'assistant' | 'tool' | undefined;
  let buffer: string[] = [];

  const flush = (): void => {
    if (currentRole === undefined || buffer.length === 0) return;
    const text = buffer.join('\n\n');
    if (currentRole === 'tool') {
      // 'tool' role chunks are an oddity in the context pipeline —
      // tools normally enter the conversation via the tool loop, not
      // via context producers. If a producer ever emits one, we drop
      // it here because it's missing toolCallId/name. Producers should
      // not emit tool-role chunks.
      buffer = [];
      currentRole = undefined;
      return;
    }
    if (currentRole === 'system') messages.push({ role: 'system', content: text });
    else if (currentRole === 'user') messages.push({ role: 'user', content: text });
    else if (currentRole === 'assistant') messages.push({ role: 'assistant', content: text });
    buffer = [];
  };

  for (const chunk of surviving) {
    if (chunk.role !== currentRole) {
      flush();
      currentRole = chunk.role;
    }
    buffer.push(stringifyChunkContent(chunk));
  }
  flush();

  return messages;
};
