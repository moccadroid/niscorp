import { z } from 'zod';
import { HtmlSourceInspectionSchema } from './source-author.js';

export const ReviewVerdictSchema = z
  .object({
    accepted: z.boolean().describe('Whether the supplied evidence satisfies this review task.'),
    reason: z.string().min(1).describe('Concrete evidence supporting this verdict.'),
  })
  .strict();

export const ReviewResponseSchema = z.union([HtmlSourceInspectionSchema, ReviewVerdictSchema]);

export const SourceEvidenceSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('html'), url: z.url(), html: z.string() }).strict(),
  z.object({ format: z.literal('json'), url: z.url(), document: z.json() }).strict(),
  z.object({ format: z.literal('xml'), url: z.url(), xml: z.string() }).strict(),
]);
