import { z } from 'zod';
import { ActionDefinitionSchema } from '@niscorp/nova';

export const INTEGRATION_ID = /^[a-z][a-z0-9-]*$/;
export const INTEGRATION_ID_RULE = 'An integration id is lower-case letters, digits and hyphens, and starts with a letter.';

export const BundleSchema = z
  .object({
    integration: z.string().regex(INTEGRATION_ID, INTEGRATION_ID_RULE),
    grants: z
      .object({
        actions: z.array(z.string()).default([]),
        data: z.array(z.string()).default([]),
      })
      .default({ actions: [], data: [] }),
    grammar: z.record(z.string(), z.number().int().nonnegative()).optional(),
    actions: z.record(z.string(), ActionDefinitionSchema),
    phrasebook: z.record(z.string().regex(/^[a-z]{2}$/, 'a phrasebook is keyed by LANGUAGE (`de`), never by locale (`de-AT`)'), z.record(z.string(), z.string())).default({}),
    extension: z.unknown().optional(),
  })
  .strict();

export type Bundle = z.infer<typeof BundleSchema>;
