// ═══════════════════════════════════════════════════════════
// ContentChunk schema — the unit of context production
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.2: producers emit ContentChunks. The pipeline
// scores, evicts, packs, and converts them to provider-format messages.
//
// We do NOT validate ContentChunks at runtime — they cross trust
// boundaries only in tests. The schema exists for documentation and
// for the few places where a chunk arrives from outside (e.g. a
// snapshot loaded from disk in a future event-replay scenario).

import { z } from 'zod';

const ContentPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z.object({
    type: z.literal('image'),
    source: z.union([
      z.object({ type: z.literal('url'), url: z.string() }).strict(),
      z.object({ type: z.literal('base64'), mediaType: z.string(), data: z.string() }).strict(),
    ]),
  }).strict(),
]);

export const ContentChunkSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string(), z.array(ContentPartSchema)]),
    tokens: z.number().nonnegative().optional(),
    evictable: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().describe('Producer id that emitted this chunk.'),
  })
  .strict();

export type ContentPart = z.infer<typeof ContentPartSchema>;
export type ContentChunk = z.infer<typeof ContentChunkSchema>;
