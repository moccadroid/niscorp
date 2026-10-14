import type { Sequence } from '@niscorp/strata';
import { z } from 'zod';
import { REFRESH_MODES } from '../cache/cache.types.js';
import { QuerySchema } from '../schemas/query.schema.js';

// An entry as it is written, without the fingerprint it is kept under.
export const VEX_SEQUENCE: Sequence = {
  id: 'nisc.vex',
  documents: { entry: { embeds: { mapping: 'nisc.prism/config' } } },
  migrations: [],
};

// Read by the grammar check, which snapshots it and fails when it changes
// without a migration here.
export const VEX_SCHEMAS = {
  'nisc.vex/entry': z
    .object({
      dsl: QuerySchema,
      mapping: z.unknown().optional(),
      shape: z.unknown().optional(),
      intent: z.string().optional(),
      reach: z.string().optional(),
      refresh: z.enum(REFRESH_MODES).optional(),
    })
    .strict(),
} as const;
