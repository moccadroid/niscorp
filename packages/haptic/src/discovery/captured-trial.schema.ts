import { z } from 'zod';
import { ArtifactSchema } from '../engine/schema.js';
import { HttpSourceSchema } from '../operations/http-source.js';
import { TrialResultSchema } from './trial.js';

export const CapturedTrialInputSchema = z
  .object({
    artifact: ArtifactSchema,
    captures: z.array(
      z
        .object({ source: HttpSourceSchema.nullable(), redirects: z.array(HttpSourceSchema) })
        .strict(),
    ),
    url: z.url(),
  })
  .strict();

export const CapturedTrialOutputSchema = z
  .object({ outcomes: z.array(TrialResultSchema.extend({ id: z.string() })) })
  .strict();
